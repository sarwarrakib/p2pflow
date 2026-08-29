package httpapi

import (
	"archive/zip"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var releaseVersionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9][A-Za-z0-9._-]*)?$`)

type systemReleaseManifest struct {
	Version   string `json:"version"`
	SHA256    string `json:"sha256"`
	Signature string `json:"signature"`
	Notes     string `json:"notes,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
}

type systemReleaseRow struct {
	ID         int64
	Version    string
	SHA256     string
	Status     string
	Manifest   string
	StagedPath string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (s *Server) updateSecurityReady() bool {
	return !s.cfg.UpdateRequireSignature || strings.TrimSpace(s.cfg.UpdatePublicKey) != ""
}

func (s *Server) handleSystemUpdateStatus(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	schemaVersion := "unknown"
	_ = s.store.DB.QueryRowContext(r.Context(), `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`).Scan(&schemaVersion)
	rows, err := s.store.DB.QueryContext(r.Context(), `SELECT id,version,sha256,status,manifest_json,staged_path,created_at,updated_at FROM system_release_history ORDER BY id DESC LIMIT 30`)
	releases := []map[string]any{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var x systemReleaseRow
			if rows.Scan(&x.ID, &x.Version, &x.SHA256, &x.Status, &x.Manifest, &x.StagedPath, &x.CreatedAt, &x.UpdatedAt) == nil {
				releases = append(releases, map[string]any{
					"id": x.ID, "version": x.Version, "sha256": x.SHA256, "status": x.Status,
					"manifest": jsonMap(x.Manifest), "stagedPath": x.StagedPath,
					"createdAt": x.CreatedAt, "updatedAt": x.UpdatedAt, "current": x.Version == s.cfg.Version,
				})
			}
		}
	}
	if len(releases) == 0 {
		releases = append(releases, map[string]any{"version": s.cfg.Version, "status": "runtime", "current": true, "createdAt": s.startedAt})
	}
	latest := map[string]any{"status": "idle"}
	if len(releases) > 0 {
		latest = releases[0]
	}
	applyReady := filepath.IsAbs(s.cfg.UpdateApplyProgram) && strings.TrimSpace(s.cfg.UpdateApplyProgram) != ""
	writeJSON(w, 200, map[string]any{
		"currentVersion": s.cfg.Version, "availableVersion": "", "repositorySourceVersion": "", "schemaVersion": schemaVersion,
		"availableRelease": func() any {
			if len(releases) > 0 && asString(releases[0]["version"]) != s.cfg.Version {
				return releases[0]
			}
			return nil
		}(),
		"installedReleases": releases, "backups": []any{}, "stageJob": latest,
		"lastCheckMessage": "Signed release staging is available. Stage a ZIP, verify it, run migrations on the staged release, then atomically switch the current release and restart/roll over instances.",
		"lastCheckError":   "", "lastResult": map[string]any{},
		"config": map[string]any{
			"repository": "", "repositoryConfigured": false, "tokenConfigured": false, "connectionReady": true,
			"signatureRequired": s.cfg.UpdateRequireSignature, "publicKeyConfigured": strings.TrimSpace(s.cfg.UpdatePublicKey) != "",
			"releaseSecurityReady": s.updateSecurityReady(), "automaticInstallReady": applyReady,
			"ready": s.updateSecurityReady(), "deploymentMode": "signed-atomic-v2", "releaseDir": s.cfg.UpdateReleaseDir,
			"currentLink": s.cfg.UpdateCurrentLink, "maxArtifactBytes": s.cfg.UpdateMaxArtifactBytes,
		},
	})
}

func (s *Server) handleSystemUpdateStageStatus(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	var x systemReleaseRow
	err := s.store.DB.QueryRowContext(r.Context(), `SELECT id,version,sha256,status,manifest_json,staged_path,created_at,updated_at FROM system_release_history ORDER BY id DESC LIMIT 1`).Scan(&x.ID, &x.Version, &x.SHA256, &x.Status, &x.Manifest, &x.StagedPath, &x.CreatedAt, &x.UpdatedAt)
	if err != nil {
		writeJSON(w, 200, map[string]any{"job": map[string]any{"status": "idle"}})
		return
	}
	writeJSON(w, 200, map[string]any{"job": map[string]any{"id": x.ID, "version": x.Version, "sha256": x.SHA256, "status": x.Status, "manifest": jsonMap(x.Manifest), "stagedPath": x.StagedPath, "createdAt": x.CreatedAt, "updatedAt": x.UpdatedAt}})
}

func (s *Server) systemUpdateStageUpload(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	if !s.updateSecurityReady() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "update_signature_key_required", "message": "P2PFLOW_UPDATE_REQUIRE_SIGNATURE is enabled but P2PFLOW_UPDATE_PUBLIC_KEY is not configured."})
		return
	}
	max := s.cfg.UpdateMaxArtifactBytes
	if max < 1<<20 {
		max = 512 << 20
	}
	r.Body = http.MaxBytesReader(w, r.Body, max+(2<<20))
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "release_upload_invalid", "message": err.Error()})
		return
	}
	file, header, err := r.FormFile("release")
	if err != nil {
		writeJSON(w, 422, envelope{"error": "release_file_required"})
		return
	}
	defer file.Close()
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
		writeJSON(w, 422, envelope{"error": "release_zip_required"})
		return
	}

	base, err := filepath.Abs(s.cfg.UpdateReleaseDir)
	if err != nil || strings.TrimSpace(base) == "" {
		writeJSON(w, 500, envelope{"error": "release_directory_invalid"})
		return
	}
	artifactDir := filepath.Join(base, "artifacts")
	stagingDir := filepath.Join(base, ".staging")
	releasesDir := filepath.Join(base, "releases")
	for _, dir := range []string{artifactDir, stagingDir, releasesDir} {
		if err := os.MkdirAll(dir, 0750); err != nil {
			writeJSON(w, 500, map[string]any{"error": "release_directory_unavailable", "message": err.Error()})
			return
		}
	}
	tmp, err := os.CreateTemp(artifactDir, ".upload-*.zip")
	if err != nil {
		writeJSON(w, 500, envelope{"error": "release_temp_failed"})
		return
	}
	tmpPath := tmp.Name()
	keepArtifact := false
	defer func() {
		_ = tmp.Close()
		if !keepArtifact {
			_ = os.Remove(tmpPath)
		}
	}()
	h := sha256.New()
	written, err := io.Copy(io.MultiWriter(tmp, h), io.LimitReader(file, max+1))
	if err != nil || written > max {
		writeJSON(w, http.StatusRequestEntityTooLarge, envelope{"error": "release_too_large"})
		return
	}
	if err := tmp.Sync(); err != nil || tmp.Close() != nil {
		writeJSON(w, 500, envelope{"error": "release_write_failed"})
		return
	}
	sha := hex.EncodeToString(h.Sum(nil))

	manifest := systemReleaseManifest{}
	manifestRaw := strings.TrimSpace(r.FormValue("manifest"))
	if manifestRaw != "" {
		if err := json.Unmarshal([]byte(manifestRaw), &manifest); err != nil {
			writeJSON(w, 422, map[string]any{"error": "release_manifest_invalid", "message": err.Error()})
			return
		}
	}
	manifest.Version = firstNonEmpty(strings.TrimSpace(manifest.Version), strings.TrimSpace(r.FormValue("version")))
	manifest.SHA256 = firstNonEmpty(strings.TrimSpace(manifest.SHA256), strings.TrimSpace(r.FormValue("sha256")))
	manifest.Signature = firstNonEmpty(strings.TrimSpace(manifest.Signature), strings.TrimSpace(r.FormValue("signature")))
	if manifest.SHA256 != "" && !strings.EqualFold(manifest.SHA256, sha) {
		writeJSON(w, 422, map[string]any{"error": "release_checksum_mismatch", "expected": manifest.SHA256, "actual": sha})
		return
	}

	extractTmp, err := os.MkdirTemp(stagingDir, "release-*")
	if err != nil {
		writeJSON(w, 500, envelope{"error": "release_stage_failed"})
		return
	}
	defer os.RemoveAll(extractTmp)
	root, err := extractReleaseZip(tmpPath, extractTmp, max*2)
	if err != nil {
		writeJSON(w, 422, map[string]any{"error": "release_archive_invalid", "message": err.Error()})
		return
	}
	versionBytes, err := os.ReadFile(filepath.Join(root, "VERSION"))
	if err != nil {
		writeJSON(w, 422, envelope{"error": "release_version_missing"})
		return
	}
	archiveVersion := strings.TrimSpace(string(versionBytes))
	if manifest.Version == "" {
		manifest.Version = archiveVersion
	}
	if manifest.Version != archiveVersion || !releaseVersionPattern.MatchString(manifest.Version) {
		writeJSON(w, 422, map[string]any{"error": "release_version_invalid", "manifestVersion": manifest.Version, "archiveVersion": archiveVersion})
		return
	}
	if manifest.Version == s.cfg.Version {
		writeJSON(w, 409, map[string]any{"error": "release_already_running", "version": manifest.Version})
		return
	}
	manifest.SHA256 = sha
	if err := verifyReleaseSignature(s.cfg.UpdatePublicKey, manifest, s.cfg.UpdateRequireSignature); err != nil {
		writeJSON(w, 422, map[string]any{"error": "release_signature_invalid", "message": err.Error()})
		return
	}
	if err := validateReleaseRoot(root); err != nil {
		writeJSON(w, 422, map[string]any{"error": "release_layout_invalid", "message": err.Error()})
		return
	}

	finalDir := filepath.Join(releasesDir, "v"+manifest.Version+"-"+sha[:12])
	if _, err := os.Stat(finalDir); errors.Is(err, os.ErrNotExist) {
		if err := os.Rename(root, finalDir); err != nil {
			writeJSON(w, 500, map[string]any{"error": "release_atomic_stage_failed", "message": err.Error()})
			return
		}
	}
	artifactPath := filepath.Join(artifactDir, "P2PFlow_v"+manifest.Version+"_"+sha[:12]+".zip")
	if tmpPath != artifactPath {
		if err := os.Rename(tmpPath, artifactPath); err != nil {
			// The verified/extracted release is still valid. Record the archive move
			// failure but do not silently delete the staged tree.
			s.systemUpdateEvent(r.Context(), "artifact_archive_warning", manifest.Version, err.Error(), map[string]any{"sha256": sha}, u.ID)
		} else {
			keepArtifact = true
			tmpPath = artifactPath
		}
	}

	manifestBytes, _ := json.Marshal(manifest)
	var id int64
	if s.store.Driver == "postgres" {
		err = s.store.DB.QueryRowContext(r.Context(), `INSERT INTO system_release_history(version,sha256,status,manifest_json,staged_path,requested_by,created_at,updated_at) VALUES($1,$2,'staged',$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, manifest.Version, sha, string(manifestBytes), finalDir, u.ID).Scan(&id)
	} else {
		res, e := s.store.DB.ExecContext(r.Context(), `INSERT INTO system_release_history(version,sha256,status,manifest_json,staged_path,requested_by,created_at,updated_at) VALUES(?,?,'staged',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, manifest.Version, sha, string(manifestBytes), finalDir, u.ID)
		err = e
		if e == nil {
			id, _ = res.LastInsertId()
		}
	}
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": "release_history_failed", "message": err.Error()})
		return
	}
	s.systemUpdateEvent(r.Context(), "release_staged", manifest.Version, "Release verified and staged", map[string]any{"sha256": sha, "releaseId": id, "artifact": artifactPath}, u.ID)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "system_update.stage", "system_release", fmt.Sprint(id), r, map[string]any{"version": manifest.Version, "sha256": sha})
	writeJSON(w, 201, map[string]any{"ok": true, "release": map[string]any{"id": id, "version": manifest.Version, "sha256": sha, "status": "staged", "stagedPath": finalDir, "artifactPath": artifactPath, "signatureVerified": manifest.Signature != ""}, "next": "Run the staged release's p2pflow-migrate, validate /ready on a new instance, then request atomic activation."})
}

func extractReleaseZip(zipPath, destination string, maxUncompressed int64) (string, error) {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer zr.Close()
	if len(zr.File) == 0 || len(zr.File) > 20000 {
		return "", errors.New("release archive has an invalid file count")
	}
	base, _ := filepath.Abs(destination)
	var total int64
	for _, f := range zr.File {
		name := filepath.Clean(filepath.FromSlash(f.Name))
		if name == "." || filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) {
			return "", fmt.Errorf("unsafe archive path %q", f.Name)
		}
		if f.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("archive symlink is not allowed: %q", f.Name)
		}
		total += int64(f.UncompressedSize64)
		if total > maxUncompressed {
			return "", errors.New("release uncompressed size exceeds limit")
		}
		target := filepath.Join(base, name)
		targetAbs, _ := filepath.Abs(target)
		rel, relErr := filepath.Rel(base, targetAbs)
		if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return "", fmt.Errorf("unsafe archive target %q", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(targetAbs, 0750); err != nil {
				return "", err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetAbs), 0750); err != nil {
			return "", err
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		mode := f.Mode().Perm()
		if mode == 0 {
			mode = 0640
		}
		out, err := os.OpenFile(targetAbs, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
		if err != nil {
			rc.Close()
			return "", err
		}
		_, copyErr := io.Copy(out, io.LimitReader(rc, int64(f.UncompressedSize64)+1))
		closeErr := out.Close()
		rc.Close()
		if copyErr != nil {
			return "", copyErr
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	if _, err := os.Stat(filepath.Join(base, "VERSION")); err == nil {
		return base, nil
	}
	entries, err := os.ReadDir(base)
	if err != nil {
		return "", err
	}
	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, filepath.Join(base, e.Name()))
		}
	}
	if len(dirs) == 1 {
		if _, err := os.Stat(filepath.Join(dirs[0], "VERSION")); err == nil {
			return dirs[0], nil
		}
	}
	return "", errors.New("release archive must contain VERSION at its root or inside one top-level directory")
}

func validateReleaseRoot(root string) error {
	required := []string{"VERSION", filepath.Join("web", "index.html"), "migrations"}
	for _, rel := range required {
		if _, err := os.Stat(filepath.Join(root, rel)); err != nil {
			return fmt.Errorf("required release path missing: %s", rel)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "p2pflow")); err == nil {
		return nil
	}
	if _, err := os.Stat(filepath.Join(root, "cmd", "p2pflow")); err == nil {
		return nil
	}
	return errors.New("release must contain a p2pflow binary or cmd/p2pflow source")
}

func releaseSignatureMessage(m systemReleaseManifest) []byte {
	return []byte("p2pflow-release:v1\nversion=" + strings.TrimSpace(m.Version) + "\nsha256=" + strings.ToLower(strings.TrimSpace(m.SHA256)) + "\n")
}

func decodeFlexibleBytes(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty value")
	}
	for _, dec := range []func(string) ([]byte, error){base64.RawURLEncoding.DecodeString, base64.URLEncoding.DecodeString, base64.RawStdEncoding.DecodeString, base64.StdEncoding.DecodeString, hex.DecodeString} {
		if b, err := dec(raw); err == nil {
			return b, nil
		}
	}
	return nil, errors.New("value is not valid base64/base64url/hex")
}

func verifyReleaseSignature(publicKeyRaw string, manifest systemReleaseManifest, required bool) error {
	sigRaw := strings.TrimSpace(manifest.Signature)
	keyRaw := strings.TrimSpace(publicKeyRaw)
	if sigRaw == "" {
		if required {
			return errors.New("release signature is required")
		}
		return nil
	}
	if keyRaw == "" {
		return errors.New("release signature was provided but no public key is configured")
	}
	pub, err := decodeFlexibleBytes(keyRaw)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return errors.New("P2PFLOW_UPDATE_PUBLIC_KEY must encode a 32-byte Ed25519 public key")
	}
	sig, err := decodeFlexibleBytes(sigRaw)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return errors.New("release signature must encode a 64-byte Ed25519 signature")
	}
	if !ed25519.Verify(ed25519.PublicKey(pub), releaseSignatureMessage(manifest), sig) {
		return errors.New("Ed25519 release signature verification failed")
	}
	return nil
}

func (s *Server) systemUpdateApply(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	version := strings.TrimSpace(mapString(in, "version"))
	s.requestReleaseActivation(w, r, u, version, false)
}

func (s *Server) systemUpdateRollback(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	version := strings.TrimSpace(mapString(in, "version"))
	if version == "" {
		_ = s.store.DB.QueryRowContext(r.Context(), `SELECT version FROM system_release_history WHERE version<>`+s.store.Bind(1)+` AND status IN ('staged','activation_requested','activation_handoff_complete','active') ORDER BY id DESC LIMIT 1`, s.cfg.Version).Scan(&version)
	}
	s.requestReleaseActivation(w, r, u, version, true)
}

func (s *Server) requestReleaseActivation(w http.ResponseWriter, r *http.Request, u ctxUser, version string, rollback bool) {
	if version == "" || !releaseVersionPattern.MatchString(version) {
		writeJSON(w, 422, envelope{"error": "release_version_required"})
		return
	}
	var x systemReleaseRow
	err := s.store.DB.QueryRowContext(r.Context(), `SELECT id,version,sha256,status,manifest_json,staged_path,created_at,updated_at FROM system_release_history WHERE version=`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 1`, version).Scan(&x.ID, &x.Version, &x.SHA256, &x.Status, &x.Manifest, &x.StagedPath, &x.CreatedAt, &x.UpdatedAt)
	if err != nil {
		writeJSON(w, 404, envelope{"error": "staged_release_not_found"})
		return
	}
	if err := validateReleaseRoot(x.StagedPath); err != nil {
		writeJSON(w, 409, map[string]any{"error": "staged_release_unavailable", "message": err.Error()})
		return
	}
	action := "apply"
	if rollback {
		action = "rollback"
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE system_release_history SET status='activation_requested',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), x.ID)
	s.systemUpdateEvent(r.Context(), "release_"+action+"_requested", version, "Atomic deployment handoff requested", map[string]any{"releaseId": x.ID, "stagedPath": x.StagedPath}, u.ID)
	s.svc.Audit(r.Context(), u.TenantID, u.ID, "system_update."+action, "system_release", fmt.Sprint(x.ID), r, map[string]any{"version": version})

	commandPreview := fmt.Sprintf("p2pflow-updater activate --release-dir %q --version %q --current-link %q", s.cfg.UpdateReleaseDir, version, s.cfg.UpdateCurrentLink)
	program := strings.TrimSpace(s.cfg.UpdateApplyProgram)
	if program == "" || !filepath.IsAbs(program) {
		writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "status": "activation_requested", "version": version, "automatic": false, "restartRequired": true, "handoffCommand": commandPreview, "message": "Release is verified and staged. Run the fixed updater on the host, run/verify migrations, then restart or roll over P2PFlow instances."})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, program, "activate", "--release-dir", s.cfg.UpdateReleaseDir, "--version", version, "--current-link", s.cfg.UpdateCurrentLink)
	out, cmdErr := cmd.CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if len(msg) > 4000 {
		msg = msg[:4000]
	}
	if cmdErr != nil {
		_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE system_release_history SET status='activation_failed',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), x.ID)
		s.systemUpdateEvent(r.Context(), "release_"+action+"_failed", version, cmdErr.Error(), map[string]any{"output": msg}, u.ID)
		writeJSON(w, 500, map[string]any{"error": "update_handoff_failed", "message": cmdErr.Error(), "output": msg})
		return
	}
	_, _ = s.store.DB.ExecContext(r.Context(), `UPDATE system_release_history SET status='activation_handoff_complete',updated_at=CURRENT_TIMESTAMP WHERE id=`+s.store.Bind(1), x.ID)
	s.systemUpdateEvent(r.Context(), "release_"+action+"_handoff_complete", version, "Current release pointer switched; process restart/rollout is still required", map[string]any{"output": msg}, u.ID)
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "status": "activation_handoff_complete", "version": version, "automatic": true, "restartRequired": true, "output": msg, "message": "Atomic release pointer switched. Restart/roll over instances and verify /ready before removing the old release."})
}

func (s *Server) systemUpdateEvent(ctx context.Context, eventType, version, message string, metadata any, userID int64) {
	b, _ := json.Marshal(metadata)
	_, _ = s.store.DB.ExecContext(ctx, `INSERT INTO system_update_events(event_type,version,message,metadata_json,user_id,created_at) VALUES(`+s.store.Bind(1)+`,`+s.store.Bind(2)+`,`+s.store.Bind(3)+`,`+s.store.Bind(4)+`,`+s.store.Bind(5)+`,CURRENT_TIMESTAMP)`, eventType, version, message, string(b), nullIDHTTP(userID))
}

func nullIDHTTP(v int64) any {
	if v <= 0 {
		return nil
	}
	return v
}

func (s *Server) handleSystemUpdateCompatibilityAction(w http.ResponseWriter, r *http.Request, u ctxUser) {
	if !s.requireSuper(w, u) {
		return
	}
	var in map[string]any
	if !decode(w, r, &in) {
		return
	}
	action := strings.ToLower(firstNonEmpty(mapString(in, "a", "action"), "status"))
	switch action {
	case "status", "check", "refresh", "stage-status":
		s.handleSystemUpdateStatus(w, r, u)
	case "apply", "install", "commit":
		s.requestReleaseActivation(w, r, u, strings.TrimSpace(mapString(in, "version")), false)
	case "rollback":
		version := strings.TrimSpace(mapString(in, "version"))
		if version == "" {
			_ = s.store.DB.QueryRowContext(r.Context(), `SELECT version FROM system_release_history WHERE version<>`+s.store.Bind(1)+` ORDER BY id DESC LIMIT 1`, s.cfg.Version).Scan(&version)
		}
		s.requestReleaseActivation(w, r, u, version, true)
	default:
		writeJSON(w, 409, map[string]any{"ok": false, "error": "unsupported_update_action", "message": "Use the signed atomic stage/apply/rollback endpoints in P2PFlow v2.", "action": action})
	}
}

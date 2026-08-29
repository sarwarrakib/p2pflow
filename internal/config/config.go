package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	EnvFile           string
	Version           string
	InstanceID        string
	SuperAdminEmail   string
	Env               string
	Listen            string
	PublicDir         string
	MigrationDir      string
	DBDriver          string
	DBURL             string
	DBMaxOpen         int
	DBMaxIdle         int
	DBConnMaxLifetime time.Duration
	AppSecret         string
	CookieSecure      bool
	CookieDomain      string
	SessionTTL        time.Duration

	BinanceAPIBaseURL            string
	BinanceHTTPConcurrency       int
	BinanceHTTPPerKeyConcurrency int
	BinanceInteractiveReserve    int
	BinanceSyncMaxPages          int
	BinanceOrderSyncInterval     time.Duration
	BinanceAdsSyncInterval       time.Duration
	BinanceChatReconnectMin      time.Duration
	BinanceChatReconnectMax      time.Duration

	NATSURL              string
	RedisURL             string
	ExtensionToken       string
	ExtensionPollSeconds int
	PublicBaseURL        string
	UploadDir            string
	MaxUploadBytes       int64
	AutoMigrate          bool
	WorkerEnabled        bool
	SetupRequired        bool
	SetupCodeFile        string

	SMTPHost                string
	SMTPPort                int
	SMTPUser                string
	SMTPPassword            string
	SMTPFrom                string
	SMTPFromName            string
	VAPIDPrivateKey         string
	VAPIDPublicKey          string
	VAPIDSubject            string
	PushTTL                 time.Duration
	PushDeliveryConcurrency int
	UpdateReleaseDir        string
	UpdatePublicKey         string
	UpdateRequireSignature  bool
	UpdateMaxArtifactBytes  int64
	UpdateApplyProgram      string
	UpdateCurrentLink       string
	BillingWebhookSecret    string
	BillingDefaultProvider  string
	BillingCheckoutURL      string
	BillingCheckoutAPIKey   string
	BillingCurrency         string
	BillingGracePeriod      time.Duration
	BillingInvoiceLead      time.Duration
}

func Load() (Config, error) {
	envFile := getenv("P2PFLOW_ENV_FILE", ".env")
	loadEnvFile(envFile)
	c := Config{
		EnvFile:                      envFile,
		Version:                      getenv("P2PFLOW_VERSION", "2.0.8"),
		InstanceID:                   getenv("P2PFLOW_INSTANCE_ID", defaultInstanceID()),
		SuperAdminEmail:              strings.ToLower(strings.TrimSpace(os.Getenv("P2PFLOW_SUPERADMIN_EMAIL"))),
		Env:                          getenv("P2PFLOW_ENV", "development"),
		Listen:                       getenv("P2PFLOW_LISTEN", ":8080"),
		PublicDir:                    getenv("P2PFLOW_PUBLIC_DIR", "./web"),
		MigrationDir:                 getenv("P2PFLOW_MIGRATION_DIR", "./migrations"),
		DBDriver:                     strings.ToLower(getenv("DB_DRIVER", "postgres")),
		DBURL:                        strings.TrimSpace(os.Getenv("DB_URL")),
		DBMaxOpen:                    getenvInt("DB_MAX_OPEN", 50),
		DBMaxIdle:                    getenvInt("DB_MAX_IDLE", 20),
		DBConnMaxLifetime:            getenvDuration("DB_CONN_MAX_LIFETIME", 30*time.Minute),
		AppSecret:                    strings.TrimSpace(os.Getenv("APP_SECRET")),
		CookieSecure:                 getenvBool("COOKIE_SECURE", false),
		CookieDomain:                 strings.TrimSpace(os.Getenv("COOKIE_DOMAIN")),
		SessionTTL:                   getenvDuration("SESSION_TTL", 24*time.Hour),
		BinanceAPIBaseURL:            getenv("BINANCE_API_BASE_URL", "https://api.binance.com"),
		BinanceHTTPConcurrency:       getenvInt("P2PFLOW_BINANCE_HTTP_CONCURRENCY", 12),
		BinanceHTTPPerKeyConcurrency: getenvInt("P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY", 3),
		BinanceInteractiveReserve:    getenvInt("P2PFLOW_BINANCE_INTERACTIVE_RESERVE", 3),
		BinanceSyncMaxPages:          getenvInt("P2PFLOW_BINANCE_SYNC_MAX_PAGES", 5),
		BinanceOrderSyncInterval:     getenvDuration("P2PFLOW_BINANCE_ORDER_SYNC_INTERVAL", 3*time.Second),
		BinanceAdsSyncInterval:       getenvDuration("P2PFLOW_BINANCE_ADS_SYNC_INTERVAL", 30*time.Second),
		BinanceChatReconnectMin:      getenvDuration("P2PFLOW_BINANCE_CHAT_RECONNECT_MIN", 1*time.Second),
		BinanceChatReconnectMax:      getenvDuration("P2PFLOW_BINANCE_CHAT_RECONNECT_MAX", 30*time.Second),
		NATSURL:                      strings.TrimSpace(os.Getenv("NATS_URL")),
		RedisURL:                     strings.TrimSpace(os.Getenv("REDIS_URL")),
		ExtensionToken:               strings.TrimSpace(os.Getenv("P2PFLOW_EXTENSION_TOKEN")),
		ExtensionPollSeconds:         getenvInt("P2PFLOW_EXTENSION_POLL_SECONDS", 2),
		PublicBaseURL:                strings.TrimRight(strings.TrimSpace(os.Getenv("P2PFLOW_PUBLIC_BASE_URL")), "/"),
		UploadDir:                    getenv("P2PFLOW_UPLOAD_DIR", "./data/uploads"),
		MaxUploadBytes:               getenvInt64("P2PFLOW_MAX_UPLOAD_BYTES", 10<<20),
		AutoMigrate:                  getenvBool("P2PFLOW_AUTO_MIGRATE", false),
		WorkerEnabled:                getenvBool("P2PFLOW_WORKERS", true),
		SetupRequired:                getenvBool("P2PFLOW_SETUP_REQUIRED", false),
		SetupCodeFile:                getenv("P2PFLOW_SETUP_CODE_FILE", "./data/P2PFLOW_SETUP_CODE.txt"),
		SMTPHost:                     strings.TrimSpace(os.Getenv("SMTP_HOST")),
		SMTPPort:                     getenvInt("SMTP_PORT", 587),
		SMTPUser:                     strings.TrimSpace(os.Getenv("SMTP_USER")),
		SMTPPassword:                 os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:                     strings.TrimSpace(os.Getenv("SMTP_FROM")),
		SMTPFromName:                 getenv("SMTP_FROM_NAME", "P2PFlow"),
		VAPIDPrivateKey:              strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY")),
		VAPIDPublicKey:               strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY")),
		VAPIDSubject:                 strings.TrimSpace(os.Getenv("VAPID_SUBJECT")),
		PushTTL:                      getenvDuration("P2PFLOW_PUSH_TTL", 5*time.Minute),
		PushDeliveryConcurrency:      getenvInt("P2PFLOW_PUSH_DELIVERY_CONCURRENCY", 8),
		UpdateReleaseDir:             getenv("P2PFLOW_UPDATE_RELEASE_DIR", "./data/system-updates"),
		UpdatePublicKey:              strings.TrimSpace(os.Getenv("P2PFLOW_UPDATE_PUBLIC_KEY")),
		UpdateRequireSignature:       getenvBool("P2PFLOW_UPDATE_REQUIRE_SIGNATURE", strings.EqualFold(getenv("P2PFLOW_ENV", "development"), "production")),
		UpdateMaxArtifactBytes:       getenvInt64("P2PFLOW_UPDATE_MAX_ARTIFACT_BYTES", 512<<20),
		UpdateApplyProgram:           strings.TrimSpace(os.Getenv("P2PFLOW_UPDATE_APPLY_PROGRAM")),
		UpdateCurrentLink:            getenv("P2PFLOW_UPDATE_CURRENT_LINK", "./data/system-updates/current"),
		BillingWebhookSecret:         strings.TrimSpace(os.Getenv("BILLING_WEBHOOK_SECRET")),
		BillingDefaultProvider:       strings.ToLower(getenv("BILLING_DEFAULT_PROVIDER", "manual")),
		BillingCheckoutURL:           strings.TrimSpace(os.Getenv("BILLING_CHECKOUT_URL")),
		BillingCheckoutAPIKey:        strings.TrimSpace(os.Getenv("BILLING_CHECKOUT_API_KEY")),
		BillingCurrency:              strings.ToUpper(getenv("BILLING_CURRENCY", "BDT")),
		BillingGracePeriod:           getenvDuration("BILLING_GRACE_PERIOD", 72*time.Hour),
		BillingInvoiceLead:           getenvDuration("BILLING_INVOICE_LEAD", 7*24*time.Hour),
	}
	switch c.DBDriver {
	case "postgres", "mysql", "mariadb":
	default:
		return c, fmt.Errorf("unsupported DB_DRIVER %q; use postgres, mysql or mariadb", c.DBDriver)
	}
	if c.DBURL == "" {
		return c, fmt.Errorf("DB_URL is required")
	}
	if len(c.AppSecret) < 16 {
		return c, fmt.Errorf("APP_SECRET must contain at least 16 characters; 32+ is recommended")
	}
	if c.Env == "production" && len(c.AppSecret) < 32 {
		return c, fmt.Errorf("APP_SECRET must contain at least 32 characters in production")
	}
	if c.BinanceHTTPConcurrency < 2 {
		c.BinanceHTTPConcurrency = 2
	}
	if c.BinanceHTTPPerKeyConcurrency < 1 {
		c.BinanceHTTPPerKeyConcurrency = 1
	}
	if c.BinanceSyncMaxPages < 1 {
		c.BinanceSyncMaxPages = 1
	}
	if c.BinanceSyncMaxPages > 25 {
		c.BinanceSyncMaxPages = 25
	}
	if c.BinanceInteractiveReserve >= c.BinanceHTTPConcurrency {
		c.BinanceInteractiveReserve = c.BinanceHTTPConcurrency / 3
		if c.BinanceInteractiveReserve < 1 {
			c.BinanceInteractiveReserve = 1
		}
	}
	if c.BillingGracePeriod < 0 {
		c.BillingGracePeriod = 0
	}
	if c.BillingInvoiceLead < 0 {
		c.BillingInvoiceLead = 0
	}
	if c.BillingCurrency == "" {
		c.BillingCurrency = "BDT"
	}
	if c.PushDeliveryConcurrency < 1 {
		c.PushDeliveryConcurrency = 1
	}
	if c.PushDeliveryConcurrency > 64 {
		c.PushDeliveryConcurrency = 64
	}
	if c.PushTTL < time.Second {
		c.PushTTL = 5 * time.Minute
	}
	if c.UpdateMaxArtifactBytes < 1<<20 {
		c.UpdateMaxArtifactBytes = 512 << 20
	}
	return c, nil
}

func getenv(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}
func getenvInt(k string, d int) int {
	v, err := strconv.Atoi(strings.TrimSpace(os.Getenv(k)))
	if err == nil && v > 0 {
		return v
	}
	return d
}
func getenvInt64(k string, d int64) int64 {
	v, err := strconv.ParseInt(strings.TrimSpace(os.Getenv(k)), 10, 64)
	if err == nil && v > 0 {
		return v
	}
	return d
}
func getenvBool(k string, d bool) bool {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return d
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return d
	}
	return b
}
func getenvDuration(k string, d time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return d
	}
	x, err := time.ParseDuration(v)
	if err != nil {
		return d
	}
	return x
}

// loadEnvFile loads a simple KEY=VALUE file without overwriting variables
// already supplied by systemd, Docker, the shell or a secret manager. It keeps
// startup dependency-free and makes the packaged .env workflow work on Linux.
func loadEnvFile(path string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		idx := strings.IndexByte(line, '=')
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		if !validEnvKey(key) {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		value := strings.TrimSpace(line[idx+1:])
		if len(value) >= 2 && value[0] == '\'' && value[len(value)-1] == '\'' {
			value = value[1 : len(value)-1]
		} else if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
			if unquoted, err := strconv.Unquote(value); err == nil {
				value = unquoted
			}
		}
		_ = os.Setenv(key, value)
	}
}

func validEnvKey(key string) bool {
	if key == "" {
		return false
	}
	for i, r := range key {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || r == '_' || (i > 0 && r >= '0' && r <= '9') {
			continue
		}
		return false
	}
	return true
}

func defaultInstanceID() string {
	host, _ := os.Hostname()
	host = strings.TrimSpace(host)
	if host == "" {
		host = "p2pflow"
	}
	return fmt.Sprintf("%s-%d", host, os.Getpid())
}

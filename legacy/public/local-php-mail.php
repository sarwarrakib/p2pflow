<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

function crm_bridge_reply(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function crm_bridge_mailbox(string $value): string {
    $value = trim(str_replace(["\r", "\n", "<", ">"], '', $value));
    if ($value === '' || strlen($value) > 254) return '';
    return preg_match('/^[^@\s]+@[^@\s]+$/', $value) ? $value : '';
}

function crm_bridge_env_value(string $name): string {
    $direct = getenv($name);
    if (is_string($direct) && trim($direct) !== '') return trim($direct);
    foreach ([__DIR__.'/.env', dirname(__DIR__).'/.env'] as $file) {
        if (!is_file($file) || !is_readable($file)) continue;
        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) continue;
        foreach ($lines as $line) {
            $line = trim((string)$line);
            if ($line === '' || $line[0] === '#') continue;
            $pos = strpos($line, '=');
            if ($pos === false) continue;
            $key = trim(substr($line, 0, $pos));
            if ($key !== $name) continue;
            $value = trim(substr($line, $pos + 1));
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }
            return trim($value);
        }
    }
    return '';
}

function crm_bridge_secret_candidates(): array {
    $values = [];
    $explicit = crm_bridge_env_value('P2PFLOW_PHP_MAIL_SECRET');
    if ($explicit === '') $explicit = crm_bridge_env_value('CRM_PHP_MAIL_SECRET');
    if (strlen($explicit) >= 16) $values[] = $explicit;
    $appKey = crm_bridge_env_value('P2PFLOW_APP_KEY');
    if ($appKey === '') $appKey = crm_bridge_env_value('CRM_APP_KEY');
    if (strlen($appKey) >= 16) {
        // Node derives the default bridge signing key from APP_KEY. Keep the raw
        // APP_KEY as a legacy candidate so older clients continue to work.
        $values[] = hash_hmac('sha256', 'php-mail-bridge:v1', $appKey);
        $values[] = $appKey;
    }
    return array_values(array_unique(array_filter($values, static fn($value) => strlen((string)$value) >= 16)));
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    crm_bridge_reply(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') crm_bridge_reply(400, ['ok' => false, 'error' => 'Empty request body']);
if (strlen($raw) > 65536) crm_bridge_reply(413, ['ok' => false, 'error' => 'Request too large']);

$timestamp = trim((string)($_SERVER['HTTP_X_CRM_MAIL_TIMESTAMP'] ?? ''));
$nonce = trim((string)($_SERVER['HTTP_X_CRM_MAIL_NONCE'] ?? ''));
$signature = strtolower(trim((string)($_SERVER['HTTP_X_CRM_MAIL_SIGNATURE'] ?? '')));
$secrets = crm_bridge_secret_candidates();

if (!$secrets) crm_bridge_reply(500, ['ok' => false, 'error' => 'Mail bridge secret is not configured']);
if (!ctype_digit($timestamp) || abs(time() - (int)$timestamp) > 300) crm_bridge_reply(401, ['ok' => false, 'error' => 'Expired mail bridge request']);
if (!preg_match('/^[a-f0-9]{16,128}$/i', $nonce)) crm_bridge_reply(401, ['ok' => false, 'error' => 'Invalid mail bridge nonce']);
$validSignature = false;
foreach ($secrets as $secret) {
    $expected = hash_hmac('sha256', $timestamp.'.'.$nonce.'.'.$raw, $secret);
    if (hash_equals($expected, $signature)) { $validSignature = true; break; }
}
if (!$validSignature) crm_bridge_reply(401, ['ok' => false, 'error' => 'Invalid mail bridge signature']);

$data = json_decode($raw, true);
if (!is_array($data)) crm_bridge_reply(400, ['ok' => false, 'error' => 'Invalid JSON payload']);

$disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
$mailAvailable = function_exists('mail') && !in_array('mail', $disabled, true);
$action = (string)($data['action'] ?? 'send');

if ($action === 'probe') {
    crm_bridge_reply(200, [
        'ok' => true,
        'mailAvailable' => $mailAvailable,
        'phpVersion' => PHP_VERSION,
        'sapi' => PHP_SAPI,
        'ini' => php_ini_loaded_file() ?: '',
        'sendmailPath' => (string)ini_get('sendmail_path'),
        'smtpHostConfigured' => trim((string)ini_get('SMTP')) !== '',
        'smtpPort' => (string)ini_get('smtp_port'),
        'osFamily' => defined('PHP_OS_FAMILY') ? PHP_OS_FAMILY : PHP_OS,
    ]);
}

if (!$mailAvailable) crm_bridge_reply(503, ['ok' => false, 'error' => 'PHP mail() is unavailable or disabled in the web PHP runtime']);

$to = crm_bridge_mailbox((string)($data['to'] ?? ''));
$subject = trim(str_replace(["\r", "\n"], ' ', (string)($data['subject'] ?? '')));
$body = (string)($data['body'] ?? '');
$from = crm_bridge_mailbox((string)($data['from'] ?? ''));
$fromName = trim(str_replace(["\r", "\n", '"'], ['', '', "'"], (string)($data['fromName'] ?? 'P2PFlow')));
$replyTo = crm_bridge_mailbox((string)($data['replyTo'] ?? ''));
$envelopeFrom = crm_bridge_mailbox((string)($data['envelopeFrom'] ?? ''));

if ($to === '') crm_bridge_reply(422, ['ok' => false, 'error' => 'Invalid recipient email']);
if ($subject === '') crm_bridge_reply(422, ['ok' => false, 'error' => 'Mail subject is empty']);

$headers = [];
if ($from !== '') $headers[] = 'From: '.$fromName.' <'.$from.'>';
if ($replyTo !== '') $headers[] = 'Reply-To: '.$replyTo;
$headers[] = 'MIME-Version: 1.0';
$headers[] = 'Content-Type: text/plain; charset=UTF-8';
$headers[] = 'Content-Transfer-Encoding: 8bit';
$headers[] = 'X-Mailer: P2PFlow/PHP-Web';
$headerText = implode("\r\n", $headers);

$accepted = @mail($to, $subject, $body, $headerText);
$usedEnvelope = false;
if (!$accepted && $envelopeFrom !== '') {
    $accepted = @mail($to, $subject, $body, $headerText, '-f'.$envelopeFrom);
    $usedEnvelope = $accepted;
}
if (!$accepted) {
    $last = error_get_last();
    $message = is_array($last) && isset($last['message']) ? (string)$last['message'] : 'PHP mail() returned false';
    crm_bridge_reply(503, ['ok' => false, 'error' => $message]);
}

crm_bridge_reply(200, [
    'ok' => true,
    'accepted' => true,
    'driver' => 'php-web',
    'phpVersion' => PHP_VERSION,
    'sapi' => PHP_SAPI,
    'ini' => php_ini_loaded_file() ?: '',
    'sendmailPath' => (string)ini_get('sendmail_path'),
    'usedEnvelope' => $usedEnvelope,
]);

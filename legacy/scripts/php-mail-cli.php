<?php
declare(strict_types=1);

function crm_json_response(array $data, int $exitCode = 0): void {
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit($exitCode);
}

function crm_stderr(string $message, int $exitCode): void {
    fwrite(STDERR, $message);
    exit($exitCode);
}

function crm_mailbox(string $value): string {
    $value = trim(str_replace(["\r", "\n", "<", ">"], '', $value));
    if ($value === '' || strlen($value) > 254) return '';
    return preg_match('/^[^@\s]+@[^@\s]+$/', $value) ? $value : '';
}

$input = file_get_contents('php://stdin');
if ($input === false || trim($input) === '') $input = file_get_contents('php://input');
$data = json_decode((string)$input, true);
if (!is_array($data)) crm_stderr('Invalid JSON mail payload', 2);

$disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
$mailAvailable = function_exists('mail') && !in_array('mail', $disabled, true);
$action = (string)($data['action'] ?? 'send');

if ($action === 'probe') {
    crm_json_response([
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

if (!$mailAvailable) crm_stderr('PHP mail() is unavailable or disabled', 3);

$to = crm_mailbox((string)($data['to'] ?? ''));
$subject = trim(str_replace(["\r", "\n"], ' ', (string)($data['subject'] ?? '')));
$body = (string)($data['body'] ?? '');
$from = crm_mailbox((string)($data['from'] ?? ''));
$fromName = trim(str_replace(["\r", "\n", '"'], ['', '', "'"], (string)($data['fromName'] ?? 'P2PFlow')));
$replyTo = crm_mailbox((string)($data['replyTo'] ?? ''));
$envelopeFrom = crm_mailbox((string)($data['envelopeFrom'] ?? ''));

if ($to === '') crm_stderr('Invalid recipient email', 4);
if ($subject === '') crm_stderr('Mail subject is empty', 5);

$headers = [];
if ($from !== '') $headers[] = 'From: '.$fromName.' <'.$from.'>';
if ($replyTo !== '') $headers[] = 'Reply-To: '.$replyTo;
$headers[] = 'MIME-Version: 1.0';
$headers[] = 'Content-Type: text/plain; charset=UTF-8';
$headers[] = 'Content-Transfer-Encoding: 8bit';
$headers[] = 'X-Mailer: P2PFlow/PHP-CLI';
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
    crm_stderr($message, 6);
}

crm_json_response([
    'ok' => true,
    'accepted' => true,
    'phpVersion' => PHP_VERSION,
    'sapi' => PHP_SAPI,
    'ini' => php_ini_loaded_file() ?: '',
    'sendmailPath' => (string)ini_get('sendmail_path'),
    'usedEnvelope' => $usedEnvelope,
]);

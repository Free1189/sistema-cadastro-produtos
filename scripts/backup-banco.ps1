$raiz = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $raiz "server\.env"
$backupDir = Join-Path $raiz "backups"
$logFile = Join-Path $raiz "server\backup-automatico.log"
$pgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

function Registrar($mensagem) {
  $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $mensagem"
  Add-Content -Path $logFile -Value $linha
}

if (-not (Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$envVars = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') {
    $envVars[$matches[1]] = $matches[2]
  }
}

$env:PGPASSWORD = $envVars['DB_PASSWORD']
$dbUser = $envVars['DB_USER']
$dbHostName = $envVars['DB_HOST']
$dbName = $envVars['DB_NAME']
$dbPort = $envVars['DB_PORT']

$dataHora = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$arquivoSql = Join-Path $backupDir "backup-$dataHora.sql"
$arquivoZip = Join-Path $backupDir "backup-$dataHora.zip"

Registrar "Iniciando backup do banco $dbName"

& $pgDump --host=$dbHostName --port=$dbPort --username=$dbUser --format=plain --no-owner --file=$arquivoSql $dbName

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $arquivoSql)) {
  Registrar "ERRO: pg_dump falhou (codigo $LASTEXITCODE)"
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  exit 1
}

Compress-Archive -Path $arquivoSql -DestinationPath $arquivoZip -Force
Remove-Item $arquivoSql
Registrar "Backup criado: $arquivoZip"

if ($env:OneDrive) {
  $pastaOneDrive = Join-Path $env:OneDrive "MarauBackups"
  if (-not (Test-Path $pastaOneDrive)) {
    New-Item -ItemType Directory -Path $pastaOneDrive | Out-Null
  }
  Copy-Item $arquivoZip -Destination $pastaOneDrive -Force
  Get-ChildItem $pastaOneDrive -Filter "backup-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
  Registrar "Copia enviada para o OneDrive: $pastaOneDrive"
}

Get-ChildItem $backupDir -Filter "backup-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
Registrar "Backup finalizado com sucesso"

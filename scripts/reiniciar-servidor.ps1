$raiz = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $raiz "server\reinicio-automatico.log"

function Registrar($mensagem) {
  $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $mensagem"
  Add-Content -Path $logFile -Value $linha
}

Registrar "Iniciando reinicializacao automatica do servidor"

$todosProcessos = Get-CimInstance Win32_Process
$processosNode = $todosProcessos | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -like '*sistema-cadastro*index.js*'
}

$pidsMatados = @()
foreach ($proc in $processosNode) {
  $atual = $proc
  $raizArvore = $proc.ProcessId

  for ($i = 0; $i -lt 4; $i++) {
    $pai = $todosProcessos | Where-Object { $_.ProcessId -eq $atual.ParentProcessId }
    if (-not $pai) { break }
    if ($pai.Name -eq 'cmd.exe') {
      $raizArvore = $pai.ProcessId
      break
    }
    $atual = $pai
  }

  if ($pidsMatados -notcontains $raizArvore) {
    taskkill /F /T /PID $raizArvore 2>&1 | Out-Null
    $pidsMatados += $raizArvore
    Registrar "Encerrada arvore de processo raiz PID $raizArvore"
  }
}

Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like '*wwebjs_auth*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 3

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/k", "cd /d `"$raiz\server`" && npx nodemon index.js" `
  -WindowStyle Normal

Registrar "Servidor reiniciado com sucesso"

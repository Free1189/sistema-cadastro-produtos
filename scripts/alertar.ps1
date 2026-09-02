param(
  [string]$Titulo = "Marau Luz e Agua",
  [string]$Mensagem = "Alerta do sistema"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$icone = New-Object System.Windows.Forms.NotifyIcon
$icone.Icon = [System.Drawing.SystemIcons]::Warning
$icone.Visible = $true
$icone.BalloonTipTitle = $Titulo
$icone.BalloonTipText = $Mensagem
$icone.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Warning
$icone.ShowBalloonTip(15000)

Start-Sleep -Seconds 16
$icone.Dispose()

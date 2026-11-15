param([Parameter(Mandatory=$true)][string]$Page,[Parameter(Mandatory=$true)][string]$Action)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$speech=$null
try {
  Add-Type -AssemblyName System.Speech
  $speech=New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voice=$speech.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh-*' } | Select-Object -First 1
  if (-not $voice) { throw '没有可用中文音色' }
  $speech.SelectVoice($voice.VoiceInfo.Name)
  $speech.SetOutputToDefaultAudioDevice()
  $speech.Volume=100
  $speech.Speak('请查看工作台。'+$Page+'需要你操作。'+$Action)
  @{status='speech-completed';voice=$speech.Voice.Name;heardByUser=$false} | ConvertTo-Json -Compress
} catch {
  @{status='voice-failed';reason='Windows中文语音组件不可用或播放失败';heardByUser=$false} | ConvertTo-Json -Compress
} finally { if($speech){$speech.Dispose()} }

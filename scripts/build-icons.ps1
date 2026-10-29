param([Parameter(Mandatory=$true)][string]$ProjectRoot, [Parameter(Mandatory=$true)][string]$SourceImage)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
if ([System.IO.Path]::GetFileName($iconRoot) -notlike 'FlightStudio-*') { throw 'Expected FlightStudio project directory' }
Copy-Item -LiteralPath $SourceImage -Destination (Join-Path $iconRoot 'public/app-icon.png')
$source = [System.Drawing.Image]::FromFile($SourceImage)
function Get-IconPng([int]$size) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $stream = [System.IO.MemoryStream]::new()
  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $size, $size)
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return ,$stream.ToArray()
  } finally { $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
}
try {
  [System.IO.File]::WriteAllBytes((Join-Path $iconRoot 'desktop/icon.png'), (Get-IconPng 512))
  [System.IO.File]::WriteAllBytes((Join-Path $iconRoot 'public/favicon.png'), (Get-IconPng 64))
  $sizes = @(16,24,32,48,64,128,256)
  $images = @($sizes | ForEach-Object { ,(Get-IconPng $_) })
  $output = [System.IO.File]::Create((Join-Path $iconRoot 'desktop/icon.ico'))
  $writer = [System.IO.BinaryWriter]::new($output)
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i=0; $i -lt $sizes.Count; $i++) {
      $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
      $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
      $writer.Write([byte]0); $writer.Write([byte]0)
      $writer.Write([uint16]1); $writer.Write([uint16]32)
      $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
      $offset += $images[$i].Length
    }
    foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
  } finally { $writer.Dispose(); $output.Dispose() }
} finally { $source.Dispose() }
Get-Item -LiteralPath (Join-Path $iconRoot 'desktop/icon.png'), (Join-Path $iconRoot 'desktop/icon.ico'), (Join-Path $iconRoot 'public/favicon.png') | Select-Object Name,Length

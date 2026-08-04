<#
    Fabrique les icônes attendues par Tauri à partir de build/icon.png.

    Équivalent de `cargo tauri icon`, mais utilisable avant d'avoir installé la
    chaîne Rust. À relancer si le logo change.

        powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#>
param(
    [string]$Source = (Join-Path $PSScriptRoot '..\build\icon.png'),
    [string]$Out = (Join-Path $PSScriptRoot '..\src-tauri\icons')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Source = (Resolve-Path $Source).Path
New-Item -ItemType Directory -Force $Out | Out-Null
$original = [System.Drawing.Image]::FromFile($Source)

function Resize-Icon([int]$size) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($original, 0, 0, $size, $size)
    $graphics.Dispose()
    return $bitmap
}

function Save-Png([int]$size, [string]$name) {
    $bitmap = Resize-Icon $size
    $bitmap.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    "  $name ($size px)"
}

Save-Png 32 '32x32.png'
Save-Png 128 '128x128.png'
Save-Png 256 '128x128@2x.png'
Save-Png 512 'icon.png'
Save-Png 30 'Square30x30Logo.png'
Save-Png 44 'Square44x44Logo.png'
Save-Png 71 'Square71x71Logo.png'
Save-Png 89 'Square89x89Logo.png'
Save-Png 107 'Square107x107Logo.png'
Save-Png 142 'Square142x142Logo.png'
Save-Png 150 'Square150x150Logo.png'
Save-Png 284 'Square284x284Logo.png'
Save-Png 310 'Square310x310Logo.png'
Save-Png 50 'StoreLogo.png'

# .ico multi-tailles. System.Drawing ne sait pas en écrire, mais le format est
# simple : un en-tête, un répertoire, puis les images — en PNG depuis Vista.
$sizes = @(16, 32, 48, 64, 128, 256)
$images = foreach ($size in $sizes) {
    $bitmap = Resize-Icon $size
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    [pscustomobject]@{ Size = $size; Bytes = $stream.ToArray() }
}

$ico = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $ico
$writer.Write([uint16]0)                 # réservé
$writer.Write([uint16]1)                 # type : icône
$writer.Write([uint16]$images.Count)

$offset = 6 + 16 * $images.Count
foreach ($image in $images) {
    # 256 s'encode par 0 sur un octet.
    $dimension = if ($image.Size -ge 256) { 0 } else { $image.Size }
    $writer.Write([byte]$dimension)      # largeur
    $writer.Write([byte]$dimension)      # hauteur
    $writer.Write([byte]0)               # palette
    $writer.Write([byte]0)               # réservé
    $writer.Write([uint16]1)             # plans
    $writer.Write([uint16]32)            # bits par pixel
    $writer.Write([uint32]$image.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $image.Bytes.Length
}
foreach ($image in $images) { $writer.Write($image.Bytes) }
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $Out 'icon.ico'), $ico.ToArray())
$writer.Dispose()
"  icon.ico ($($sizes -join ', ') px)"

$original.Dispose()
"Icônes écrites dans $Out"

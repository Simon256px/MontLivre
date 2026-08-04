<#
    Dessine build/icon.png, la source de toutes les icônes.

    Le logo obéit aux mêmes règles que l'interface : aucun angle arrondi, des
    aplats pleins, un seul accent, et l'étincelle à quatre branches en signature.
    Le triangle se lit deux fois — le mont, et le livre ouvert que creuse la
    gouttière centrale.

        powershell -ExecutionPolicy Bypass -File tools/make-logo.ps1
    puis
        powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#>
param(
    [string]$Out = (Join-Path $PSScriptRoot '..\build\icon.png'),
    [int]$Size = 1024,
    [string]$Accent = '#ff5500'  # Ochre
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$coal = [System.Drawing.Color]::FromArgb(0, 0, 0)
$bg = [System.Drawing.ColorTranslator]::FromHtml($Accent)

$bitmap = New-Object System.Drawing.Bitmap $Size, $Size
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear($bg)

$u = $Size / 1024.0
function P([double]$x, [double]$y) { New-Object System.Drawing.PointF (($x * $u), ($y * $u)) }

$black = New-Object System.Drawing.SolidBrush $coal
$accentBrush = New-Object System.Drawing.SolidBrush $bg

# Deux masses, pas une de plus : c'est tout ce qui survit à 16 pixels.
#
# Le mont, franc, tranché net à sa base.
$mount = New-Object System.Drawing.Drawing2D.GraphicsPath
$mount.AddPolygon(@((P 512 132), (P 902 660), (P 122 660)))
$g.FillPath($black, $mount)

# Le livre : deux pages qui remontent vers la reliure. Un simple bloc fendu
# donnait le symbole « éjecter » ; c'est cette pente qui fait le livre.
$left = New-Object System.Drawing.Drawing2D.GraphicsPath
$left.AddPolygon(@((P 60 792), (P 492 722), (P 492 926), (P 60 926)))
$g.FillPath($black, $left)

$right = New-Object System.Drawing.Drawing2D.GraphicsPath
$right.AddPolygon(@((P 964 792), (P 532 722), (P 532 926), (P 964 926)))
$g.FillPath($black, $right)

# L'étincelle Y2K, aux flancs creusés. Quatre courbes, comme dans shapes.js.
function Add-Sparkle([System.Drawing.Drawing2D.GraphicsPath]$path, [double]$cx, [double]$cy, [double]$r) {
    $s = $r / 50.0
    function Q([double]$x, [double]$y) { P (($x - 50) * $s + $cx) (($y - 50) * $s + $cy) }
    $path.AddBezier((Q 50 0), (Q 54.6 33.4), (Q 66.6 45.4), (Q 100 50))
    $path.AddBezier((Q 100 50), (Q 66.6 54.6), (Q 54.6 66.6), (Q 50 100))
    $path.AddBezier((Q 50 100), (Q 45.4 66.6), (Q 33.4 54.6), (Q 0 50))
    $path.AddBezier((Q 0 50), (Q 33.4 45.4), (Q 45.4 33.4), (Q 50 0))
}

$sparkle = New-Object System.Drawing.Drawing2D.GraphicsPath
Add-Sparkle $sparkle 838 196 118
$g.FillPath($black, $sparkle)

$g.Dispose()
if (Test-Path $Out) { Remove-Item $Out -Force }
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

"Logo ecrit : $Out ($Size px, accent $Accent)"

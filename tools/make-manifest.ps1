<#
    Fabrique le manifeste latest.json que l'application interroge pour savoir
    s'il existe une version plus récente.

    Il doit être publié comme asset de la release, à côté de l'installeur : le
    point d'entrée configuré est
    https://github.com/Simon256px/MontLivre/releases/latest/download/latest.json

    La signature vient du fichier .sig produit par `cargo tauri build` quand la
    variable TAURI_SIGNING_PRIVATE_KEY est définie. Sans elle, pas de .sig, et
    la mise à jour serait refusée par les applications installées.

        powershell -ExecutionPolicy Bypass -File tools/make-manifest.ps1 -Notes "..."
#>
param(
    [string]$Notes = "",
    [string]$Out = (Join-Path $PSScriptRoot '..\src-tauri\target\release\bundle\latest.json')
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$config = Get-Content (Join-Path $root 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$version = $config.version
$repo = 'Simon256px/MontLivre'

$nsisDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'
$installer = Get-ChildItem $nsisDir -Filter "*_$($version)_x64-setup.exe" | Select-Object -First 1
if (-not $installer) { throw "Installeur introuvable pour la version $version dans $nsisDir" }

$sigPath = "$($installer.FullName).sig"
if (-not (Test-Path $sigPath)) {
    throw "Signature absente : $sigPath`nLancez la compilation avec TAURI_SIGNING_PRIVATE_KEY defini."
}

$manifest = [ordered]@{
    version   = $version
    notes     = $Notes
    pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = [ordered]@{
        'windows-x86_64' = [ordered]@{
            signature = (Get-Content $sigPath -Raw).Trim()
            url       = "https://github.com/$repo/releases/download/v$version/$($installer.Name)"
        }
    }
}

# ConvertTo-Json echappe apostrophes et accents en \uXXXX : valide, mais
# illisible dans une release. On les remet en clair, le fichier etant en UTF-8.
$json = $manifest | ConvertTo-Json -Depth 6
$json = [regex]::Replace($json, '\\u([0-9a-fA-F]{4})', { param($m) [char][int]("0x" + $m.Groups[1].Value) })
[System.IO.File]::WriteAllText($Out, $json, [System.Text.UTF8Encoding]::new($false))

"manifeste ecrit : $Out"
"  version   : $version"
"  installeur: $($installer.Name) ($([math]::Round($installer.Length/1MB,2)) Mo)"
"  signature : $((Get-Content $sigPath -Raw).Trim().Length) caracteres"

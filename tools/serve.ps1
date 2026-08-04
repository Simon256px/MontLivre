<#
    Serveur statique de dépannage.

    Le vrai environnement de développement, c'est `cargo tauri dev`. Ce script
    existe pour une seule raison : pouvoir regarder l'interface dans un
    navigateur avant d'avoir installé la chaîne Rust, et sans introduire Node
    dans un projet qui n'en veut pas.

        powershell -ExecutionPolicy Bypass -File tools/serve.ps1
#>
param(
    [int]$Port = 8123,
    [string]$Root = (Join-Path $PSScriptRoot '..\src')
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path

$types = @{
    '.html'  = 'text/html; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.js'    = 'text/javascript; charset=utf-8'
    '.mjs'   = 'text/javascript; charset=utf-8'
    '.json'  = 'application/json; charset=utf-8'
    '.svg'   = 'image/svg+xml'
    '.png'   = 'image/png'
    '.jpg'   = 'image/jpeg'
    '.webp'  = 'image/webp'
    '.woff2' = 'font/woff2'
    '.epub'  = 'application/epub+zip'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "MontLivre sur http://localhost:$Port/  (racine : $Root)"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }

        $full = Join-Path $Root ($relative -replace '/', '\')
        # Un chemin qui sort de la racine ne doit jamais être servi.
        $resolved = $null
        try { $resolved = (Resolve-Path -LiteralPath $full).Path } catch { }

        if ($resolved -and $resolved.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved -PathType Leaf)) {
            $bytes = [System.IO.File]::ReadAllBytes($resolved)
            $extension = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
            $response.ContentType = if ($types.ContainsKey($extension)) { $types[$extension] } else { 'application/octet-stream' }
            $response.Headers.Add('Cache-Control', 'no-store')
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        else {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 — $relative")
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }

        $response.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}

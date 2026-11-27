# Simple local server: pwsh -File serve.ps1  →  http://localhost:8123/
# (Optional — index.html also runs when opened directly from disk.)
$root = $PSScriptRoot
$l = [System.Net.HttpListener]::new()
$l.Prefixes.Add("http://localhost:8123/")
$l.Start()
Write-Host "Serving $root at http://localhost:8123/  (Ctrl+C to stop)"
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8';
            '.json' = 'application/json'; '.md' = 'text/plain; charset=utf-8'; '.png' = 'image/png'; '.svg' = 'image/svg+xml' }
while ($l.IsListening) {
  $c = $l.GetContext()
  $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
  if ($p -eq '') { $p = 'index.html' }
  $f = [IO.Path]::GetFullPath((Join-Path $root $p))
  if ($f.StartsWith($root) -and (Test-Path $f -PathType Leaf)) {
    $b = [IO.File]::ReadAllBytes($f)
    $ext = [IO.Path]::GetExtension($f).ToLower()
    $c.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
    $c.Response.Headers.Add('Cache-Control', 'no-cache')
    $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}

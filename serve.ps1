# 簡易ローカルサーバー: pwsh -File serve.ps1 → http://localhost:8123/
$root = $PSScriptRoot
$l = [System.Net.HttpListener]::new()
$l.Prefixes.Add("http://localhost:8123/")
$l.Start()
Write-Host "Serving $root at http://localhost:8123/"
while ($l.IsListening) {
  $c = $l.GetContext()
  $p = $c.Request.Url.AbsolutePath.TrimStart('/')
  if ($p -eq '') { $p = 'index.html' }
  $f = Join-Path $root $p
  if (Test-Path $f -PathType Leaf) {
    $b = [IO.File]::ReadAllBytes($f)
    $c.Response.ContentType = if ($f -like '*.html') { 'text/html; charset=utf-8' } else { 'text/plain; charset=utf-8' }
    $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}

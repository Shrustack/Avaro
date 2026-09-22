$possiblePaths = @(
    $PSScriptRoot,
    "C:\Users\Shruti\OneDrive\Desktop\Avaro",
    "C:\Users\Shruti\Desktop\Avaro"
)

$siteRoot = $possiblePaths | Where-Object { $_ -and (Test-Path (Join-Path $_ "index.html")) } | Select-Object -First 1
if (-not $siteRoot) {
    $siteRoot = $PSScriptRoot
}

$http = [System.Net.HttpListener]::new()
$http.Prefixes.Add("http://localhost:8000/")
$http.Start()
Write-Host "Server started at http://localhost:8000/"
Write-Host "Serving files from $siteRoot"

while ($http.IsListening) {
    $context = $http.GetContext()
    $request = $context.Request
    $response = $context.Response
    $localPath = $request.Url.LocalPath
    if ($localPath -eq "/") { $localPath = "/index.html" }

    $filePath = Join-Path $siteRoot $localPath.TrimStart("/")
    if (Test-Path $filePath -PathType Leaf) {
        $content = Get-Content $filePath -Raw -Encoding UTF8
        $response.ContentType = if ($filePath.EndsWith(".html")) { "text/html" } elseif ($filePath.EndsWith(".css")) { "text/css" } elseif ($filePath.EndsWith(".js")) { "application/javascript" } elseif ($filePath.EndsWith(".png") -or $filePath.EndsWith(".jpg") -or $filePath.EndsWith(".jpeg") -or $filePath.EndsWith(".gif")) { "image/" + $filePath.Split(".")[-1] } else { "text/plain" }
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    } else {
        $response.StatusCode = 404
        $response.StatusDescription = "Not Found"
        $notFound = "<h1>404 Not Found</h1>"
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($notFound)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    $response.OutputStream.Close()
}
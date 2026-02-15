$ErrorActionPreference = "Stop"

function Get-ImportSpecs {
  param([string]$Path)

  $content = Get-Content -Raw -Path $Path
  $pattern = "(?m)^\s*import\s+(?:.+?\s+from\s+)?['""]([^'""]+)['""]\s*;?"
  $matches = [regex]::Matches($content, $pattern)
  $specs = @()
  foreach ($m in $matches) {
    $specs += $m.Groups[1].Value
  }
  return $specs
}

$repoRoot = (Get-Location).Path
$jsFiles = @(
  (Join-Path $repoRoot "game.js")
) + (Get-ChildItem -Path (Join-Path $repoRoot "src") -Filter "*.js" -File | Select-Object -ExpandProperty FullName)

$missing = @()

foreach ($file in $jsFiles) {
  $baseDir = Split-Path -Parent $file
  foreach ($spec in Get-ImportSpecs -Path $file) {
    if (-not ($spec.StartsWith("./") -or $spec.StartsWith("../"))) { continue }
    $target = [System.IO.Path]::GetFullPath((Join-Path $baseDir $spec))
    if (-not (Test-Path -Path $target -PathType Leaf)) {
      $relativeFile = $file.Replace($repoRoot + "\", "")
      $missing += "$relativeFile -> $spec"
    }
  }
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing import targets:`n - " + ($missing -join "`n - "))
}

Write-Output "Import path validation passed."

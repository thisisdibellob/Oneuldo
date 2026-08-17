param(
  [string[]]$Abis = @('arm64-v8a', 'x86_64')
)

$ErrorActionPreference = 'Stop'

$frontendDirectory = Split-Path -Parent $PSScriptRoot
$repositoryDirectory = Split-Path -Parent $frontendDirectory
$manifestPath = Join-Path $frontendDirectory 'vendor\llama\llama-android.manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$llamaSourceDirectory = Join-Path $repositoryDirectory ".tools\llama.cpp-$($manifest.version)"
$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$ndkDirectory = Join-Path $androidSdk 'ndk\27.1.12297006'
$cmake = Join-Path $androidSdk 'cmake\3.22.1\bin\cmake.exe'
$ninja = Join-Path $androidSdk 'cmake\3.22.1\bin\ninja.exe'
$toolchain = Join-Path $ndkDirectory 'build\cmake\android.toolchain.cmake'
$nativeSourceDirectory = Join-Path $frontendDirectory 'native\llama-runtime'
$outputRoot = Join-Path $frontendDirectory 'vendor\llama\android'

foreach ($requiredPath in @($cmake, $ninja, $toolchain)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required Android build tool is missing: $requiredPath"
  }
}

if (-not (Test-Path -LiteralPath $llamaSourceDirectory)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $llamaSourceDirectory) | Out-Null
  git clone --filter=blob:none --depth 1 --branch $manifest.version $manifest.source $llamaSourceDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Failed to clone the pinned llama.cpp source.' }
}

$actualCommit = (git -C $llamaSourceDirectory rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $manifest.commit) {
  throw "llama.cpp source revision mismatch: $actualCommit/$($manifest.commit)"
}

foreach ($abi in $Abis) {
  if ($manifest.abis -notcontains $abi) { throw "Unsupported ABI requested: $abi" }
  $buildDirectory = Join-Path $repositoryDirectory ".tools\llama-runtime-$abi"
  $outputDirectory = Join-Path $outputRoot $abi

  & $cmake -S $nativeSourceDirectory -B $buildDirectory -G Ninja `
    "-DCMAKE_MAKE_PROGRAM=$ninja" `
    "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
    '-DANDROID_PLATFORM=android-24' `
    "-DANDROID_ABI=$abi" `
    '-DCMAKE_BUILD_TYPE=Release' `
    "-DLLAMA_SOURCE_ROOT=$llamaSourceDirectory"
  if ($LASTEXITCODE -ne 0) { throw "llama.cpp CMake configuration failed for $abi" }

  & $cmake --build $buildDirectory --target oneuldo_llama_runtime --parallel
  if ($LASTEXITCODE -ne 0) { throw "llama.cpp build failed for $abi" }

  $library = Join-Path $buildDirectory 'liboneuldo_llama_runtime.so'
  if (-not (Test-Path -LiteralPath $library)) { throw "Runtime library was not produced for $abi" }
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  Copy-Item -Force -LiteralPath $library -Destination (Join-Path $outputDirectory $manifest.library)
  $artifact = Get-Item -LiteralPath $library
  $stream = [System.IO.File]::OpenRead($library)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha256.ComputeHash($stream)
      $hash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
  Write-Output "$abi size=$($artifact.Length) sha256=$hash"
}

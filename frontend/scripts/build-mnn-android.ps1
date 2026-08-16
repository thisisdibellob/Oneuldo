param(
  [string[]]$Abis = @('arm64-v8a', 'x86_64')
)

$ErrorActionPreference = 'Stop'

$frontendDirectory = Split-Path -Parent $PSScriptRoot
$repositoryDirectory = Split-Path -Parent $frontendDirectory
$manifestPath = Join-Path $frontendDirectory 'vendor\mnn\mnn-android.manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$mnnSourceDirectory = Join-Path $repositoryDirectory ".tools\mnn-$($manifest.version)"
$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$ndkDirectory = Join-Path $androidSdk 'ndk\27.1.12297006'
$cmakeBinDirectory = Join-Path $androidSdk 'cmake\3.22.1\bin'
$cmake = Join-Path $cmakeBinDirectory 'cmake.exe'
$ninja = Join-Path $cmakeBinDirectory 'ninja.exe'
$toolchain = Join-Path $ndkDirectory 'build\cmake\android.toolchain.cmake'
$probeSourceDirectory = Join-Path $frontendDirectory 'native\mnn-probe'
$outputRoot = Join-Path $frontendDirectory 'vendor\mnn\android'

foreach ($requiredPath in @($cmake, $ninja, $toolchain)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required Android build tool is missing: $requiredPath"
  }
}

if (-not (Test-Path -LiteralPath $mnnSourceDirectory)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $mnnSourceDirectory) | Out-Null
  git clone --filter=blob:none --depth 1 --branch $manifest.version $manifest.source $mnnSourceDirectory
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to clone the pinned MNN source.'
  }
}

$actualCommit = (git -C $mnnSourceDirectory rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $manifest.commit) {
  throw "MNN source revision mismatch: $actualCommit/$($manifest.commit)"
}

foreach ($abi in $Abis) {
  if ($manifest.abis -notcontains $abi) {
    throw "Unsupported ABI requested: $abi"
  }

  $mnnBuildDirectory = Join-Path $mnnSourceDirectory "build-oneuldo-android-$abi"
  $probeBuildDirectory = Join-Path $repositoryDirectory ".tools\mnn-probe-$abi"
  $outputDirectory = Join-Path $outputRoot $abi
  $arm82 = if ($abi -eq 'arm64-v8a') { 'ON' } else { 'OFF' }

  & $cmake -S $mnnSourceDirectory -B $mnnBuildDirectory -G Ninja `
    "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
    "-DCMAKE_MAKE_PROGRAM=$ninja" `
    "-DANDROID_ABI=$abi" `
    '-DANDROID_STL=c++_shared' `
    '-DANDROID_PLATFORM=android-24' `
    '-DCMAKE_BUILD_TYPE=Release' `
    '-DMNN_BUILD_LLM=ON' `
    '-DMNN_LOW_MEMORY=ON' `
    '-DMNN_SUPPORT_TRANSFORMER_FUSE=ON' `
    '-DMNN_OPENCL=ON' `
    '-DMNN_SEP_BUILD=OFF' `
    '-DMNN_BUILD_FOR_ANDROID_COMMAND=ON' `
    '-DMNN_BUILD_TOOLS=OFF' `
    '-DMNN_BUILD_DEMO=OFF' `
    '-DMNN_BUILD_CONVERTER=OFF' `
    '-DMNN_LLM_BUILD_DEMO=OFF' `
    '-DLLM_SUPPORT_HTTP_RESOURCE=OFF' `
    '-DLLM_LOG_TO_STRING=ON' `
    '-DMNN_USE_LOGCAT=ON' `
    "-DMNN_ARM82=$arm82" `
    '-DCMAKE_SHARED_LINKER_FLAGS=-Wl,-z,max-page-size=16384'
  if ($LASTEXITCODE -ne 0) {
    throw "MNN CMake configuration failed for $abi"
  }

  & $cmake --build $mnnBuildDirectory --target MNN --parallel
  if ($LASTEXITCODE -ne 0) {
    throw "MNN build failed for $abi"
  }

  $mnnLibrary = Join-Path $mnnBuildDirectory 'libMNN.so'
  if (-not (Test-Path -LiteralPath $mnnLibrary)) {
    throw "MNN library was not produced for $abi"
  }

  & $cmake -S $probeSourceDirectory -B $probeBuildDirectory -G Ninja `
    "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
    "-DCMAKE_MAKE_PROGRAM=$ninja" `
    "-DANDROID_ABI=$abi" `
    '-DANDROID_STL=c++_shared' `
    '-DANDROID_PLATFORM=android-24' `
    '-DCMAKE_BUILD_TYPE=Release' `
    "-DMNN_SOURCE_ROOT=$mnnSourceDirectory" `
    "-DMNN_LIBRARY=$mnnLibrary"
  if ($LASTEXITCODE -ne 0) {
    throw "Probe CMake configuration failed for $abi"
  }

  & $cmake --build $probeBuildDirectory --target oneuldo_mnn_probe --parallel
  if ($LASTEXITCODE -ne 0) {
    throw "Probe build failed for $abi"
  }

  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  Copy-Item -Force -LiteralPath $mnnLibrary -Destination (Join-Path $outputDirectory 'libMNN.so')
  Copy-Item -Force -LiteralPath (Join-Path $probeBuildDirectory 'liboneuldo_mnn_probe.so') -Destination (Join-Path $outputDirectory 'liboneuldo_mnn_probe.so')
  Write-Output "MNN $($manifest.version) libraries are ready for $abi at $outputDirectory"
}

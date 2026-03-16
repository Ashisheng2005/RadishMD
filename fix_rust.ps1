$env:Path = "C:\Users\Repork\.cargo\bin;" + $env:Path
$env:RUSTUP_HOME = "C:\Users\Repork\.rustup"
$env:CARGO_HOME = "C:\Users\Repork\.cargo"

Write-Host "Updating Rustup..."
& "C:\Users\Repork\.cargo\bin\rustup.exe" update stable

Write-Host "Checking rustc again..."
& "C:\Users\Repork\.cargo\bin\rustc.exe" --version

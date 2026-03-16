$env:Path = "C:\Users\Repork\.cargo\bin;" + $env:Path
$env:RUSTUP_HOME = "C:\Users\Repork\.rustup"
$env:CARGO_HOME = "C:\Users\Repork\.cargo"

# Check Rust
Write-Host "Checking rustc..."
& "C:\Users\Repork\.cargo\bin\rustc.exe" --version

Write-Host "Checking cargo..."
& "C:\Users\Repork\.cargo\bin\cargo.exe" --version

Write-Host "Rustup show..."
& "C:\Users\Repork\.cargo\bin\rustup.exe" show

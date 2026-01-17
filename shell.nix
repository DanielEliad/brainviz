# shell.nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    python3
    uv
    nodejs_22
    
    # Build tools
    gcc
    gfortran
    
    # Libraries for binary wheels
    stdenv.cc.cc
    zlib
    zstd
    libffi
    openssl
    bzip2
    readline
    sqlite
    ncurses
    blas
    lapack
  ];
  
  shellHook = ''
    # Set library path for precompiled binaries
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath [
      pkgs.stdenv.cc.cc
      pkgs.zlib
      pkgs.zstd
      pkgs.libffi
      pkgs.openssl
      pkgs.bzip2
      pkgs.readline
      pkgs.sqlite
      pkgs.ncurses
      pkgs.gfortran.cc
      pkgs.blas
      pkgs.lapack
    ]}:$LD_LIBRARY_PATH
    
    # Create and activate venv
    cd backend
    VENV_DIR=".venv"
    
    if [ ! -d "$VENV_DIR" ]; then
      echo "Creating virtual environment..."
      uv venv "$VENV_DIR"
    fi
    
    source "$VENV_DIR/bin/activate"
    uv sync
    cd ..
    
    echo "Python environment ready!"
  '';
}

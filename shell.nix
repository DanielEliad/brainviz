{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    uv
    python311
    nodejs_22
    stdenv.cc.cc.lib
  ];

  shellHook = ''
    export UV_PYTHON="${pkgs.python311}/bin/python3"
    export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:$LD_LIBRARY_PATH"
    echo "Environment ready with uv, python311, and nodejs"
  '';
}


Stockfish.js 19.0.1, build Lite Single Threaded

The JavaScript and WebAssembly files are the unmodified upstream release assets.
Stockfish.js and Stockfish are distributed under the GNU General Public License
version 3. See Copying.txt, AUTHORS and the notices included in the JavaScript.

Release and prebuilt files
https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1

Corresponding source, including the Stockfish C++ source, Emscripten code and
build scripts, at the pinned release commit
https://github.com/nmrugg/stockfish.js/archive/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6.tar.gz

NNUE network embedded in the Lite build
https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue

The upstream build uses Emscripten 6.0.9 and can be rebuilt from that source
with node build.js --lite --single-threaded --no-split.

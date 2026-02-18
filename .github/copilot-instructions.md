# AI Copilot Instructions - Xadrez (Chess Game)

## Project Overview
This is a **Portuguese-language chess web application** with multiplayer support via Supabase. The project uses vanilla JavaScript (no frameworks), HTML5, and CSS. Three core components handle chess logic, UI rendering, and game environment/multiplayer features.

## Architecture & Key Files

### **Core Components**

1. **regrasdoxadrez.js** (221 lines)
   - Pure chess rule engine: move validation, legality checks, checkmate/stalemate detection
   - Implements: en passant, castling, pawn promotion, algebraic notation
   - Key functions: `pseudoMoves()`, `legalMoves()`, `attacked()`, `inCheck()`
   - Board represented as `b[row][col]` with pieces as `{t: 'type', co: 'color'}` objects
   - **Does NOT handle UI or multiplayer** — purely game logic

2. **tabuleiro.js** (347 lines)
   - Renders 8x8 board: squares, piece symbols (Unicode), coordinate labels
   - Manages player interaction: click detection, legal move highlighting
   - Global state object `G` tracks board, turn, selected square, legal moves, castling rights, game status
   - Functions: `renderBoard()`, `renderSquares()`, `handleSquareClick()`, `executeMove()`
   - Updates captured pieces, move history, and status indicators in real-time

3. **ambiente.js** (480 lines)
   - UI management: status display, captured pieces list, move history, turn indicators
   - Pawn promotion dialog via `showPromo()`
   - **Supabase integration**: multiplayer real-time updates, room codes, player authentication
   - Functions: `renderStatus()`, `renderCaptured()`, `renderHistory()`, `showPromo()`

4. **dashboard.html** (156 lines)
   - Single-page layout with two-panel design (black/white player sides)
   - Elements: game menu, waiting screen, board container, side panels for captured pieces, move history
   - Menu modes: create game, join game, play locally
   - Player color indicator shows which side the user controls

5. **styles.css** (974 lines)
   - Themed styling with background images
   - Board styling: 8x8 grid with alternating colors, coordinate labels
   - Animations for piece selection, status updates, promotion dialog
   - Responsive layout for side panels and history display

## Data Flow & Key Patterns

### **Game State (`G` object)**
```javascript
G = {
  board: [...],           // 8x8 array, piece = {t: type, co: color}
  turn: 'white' | 'black',
  sel: {r, c} | null,     // selected square for move
  legal: [{r, c}],        // legal moves from selected piece
  ep: {r, c} | null,      // en passant target
  cas: {white: {kS, qS}, black: {kS, qS}},  // castling rights
  status: 'playing' | 'check' | 'checkmate' | 'stalemate',
  lastMove: {fr, fc, tr, tc},
  promo: null | 'queen' | 'rook' | 'bishop' | 'knight',
  history: [{move: 'e4', ...}],
  captured: {white: [], black: []}
}
```

### **Move Execution Flow**
1. User clicks square → `handleSquareClick()` in tabuleiro.js
2. If piece selected, calculate `legalMoves()` from regrasdoxadrez.js
3. If target is legal, `executeMove()` applies move: `applyMove()`, updates board state, checks for check/checkmate
4. `renderBoard()` re-renders board and all UI elements
5. If multiplayer: broadcast move to Supabase, opponent's board updates via listener

### **Piece Representation**
- Unicode symbols defined in `UNI` object (regrasdoxadrez.js):
  ```javascript
  white: {king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙'}
  black: {king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟'}
  ```
- Piece values for capturing (PIECE_VAL): queen=9, rook=5, bishop/knight=3, pawn=1

## Common Tasks & Patterns

### **Adding Chess Rules**
- Modify `pseudoMoves()` (raw moves without legality) in regrasdoxadrez.js
- Update `legalMoves()` filters if new constraint affects king safety
- Test with `inCheck()`, `attacked()`, `kingPos()`

### **Multiplayer Communication**
- Supabase Real-Time updates: game state changes broadcast to opponent
- On opponent move received: parse move notation, update `G.board`, `renderBoard()`
- Room codes used to join existing games; automatic player color assignment

### **UI Updates**
- All UI renders from global `G` state — **no separate data layer**
- Status changes: modify `G.status`, then call `renderStatus()`
- Animation: CSS transitions in styles.css (e.g., `.selected-square` highlight)

## Code Conventions

- **Colors**: `'white'` and `'black'` strings only
- **Positions**: Always `{r, c}` where r=row (0-7 top to bottom), c=col (0-7 left to right)
- **Functions**: Prefix with verb (`legalMoves`, `inCheck`, `renderBoard`)
- **Comments**: Decorative headers with `─` and `─────` for section clarity
- **No build step**: Direct HTML script loading; files load in order: regrasdoxadrez.js → tabuleiro.js → ambiente.js

## Important Caveats

- **No error handling** for invalid moves — assumes UI prevents them
- **Castling validation** checks: king/rook unmoved, clear path, king not in/through check
- **En passant**: captured pawn removed from board; stored in `G.ep` for one move only
- **Pawn promotion**: deferred to player choice via modal dialog; blocked until selected
- **Local vs. Multiplayer**: Same `G` state; multiplayer syncs via Supabase listeners

## Testing & Debugging

- Open `dashboard.html` directly in browser
- "Jogar Localmente" (play locally) runs full game offline
- "Criar Partida"/"Entrar em Partida" requires Supabase credentials in ambiente.js
- Browser console logs via `console.log(G)` to inspect game state
- Use browser DevTools to inspect `G.board` for piece positions at any point

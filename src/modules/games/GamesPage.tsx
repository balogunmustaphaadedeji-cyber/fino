import { useCallback, useEffect, useState } from 'react';
import {
  Gamepad2,
  Trophy,
  Search,
  Users,
  Swords,
  CircleDot,
} from 'lucide-react';
import {
  listCatalogue, ensurePlayer, getLeaderboard, getRecentMatches, createRoom, joinRoomByCode,
  createMatch, completeMatch, getCurrentUserId, matchmake, leaveRoom, startRoomMatch,
  getRoomPlayers, setReady,
} from './api/client';
import { OnlineTicTacToe } from './components/OnlineTicTacToe';
import type { CatalogueGame, GameMatch, GamesPlayer } from './types';
import { TicTacToeBoard } from './components/TicTacToeBoard';
import { ChessBoard } from './components/ChessBoard';
import { LudoBoard } from './components/LudoBoard';
import './games.css';

type View = 'home' | 'play' | 'leaderboard' | 'room';

const ICONS: Record<string, typeof Gamepad2> = {
  ludo: CircleDot,
  'tic-tac-toe': Swords,
  chess: Trophy,
};

export default function GamesPage() {
  const [view, setView] = useState<View>('home');
  const [games, setGames] = useState<CatalogueGame[]>([]);
  const [player, setPlayer] = useState<GamesPlayer | null>(null);
  const [leaders, setLeaders] = useState<GamesPlayer[]>([]);
  const [history, setHistory] = useState<GameMatch[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<{user_id:string;seat:number;is_ready:boolean;is_host:boolean}[]>([]);
  const [onlineSeat, setOnlineSeat] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const uid = await getCurrentUserId();
        if (!cancelled) setUserId(uid);
        const cat = await listCatalogue().catch(() => [] as CatalogueGame[]);
        if (!cancelled) setGames(cat);
        if (uid) {
          const p = await ensurePlayer().catch(() => null);
          if (!cancelled) setPlayer(p);
          const h = await getRecentMatches(8).catch(() => []);
          if (!cancelled) setHistory(h);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = games.filter((g) => {
    if (category !== 'all' && g.category !== category) return false;
    if (query && !`${g.title} ${g.description}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const startSolo = useCallback(
    async (gameId: string) => {
      setError(null);
      setActiveGame(gameId);
      setView('play');
      if (!userId) return;
      try {
        const m = await createMatch({
          gameId,
          mode: 'solo',
          state: {},
          playerIds: [userId],
        });
        setMatchId(m.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start match record');
      }
    },
    [userId],
  );

  const finish = useCallback(
    async (result: 'win' | 'loss' | 'draw') => {
      if (!matchId || !userId) return;
      try {
        await completeMatch(
          matchId,
          result === 'draw' ? null : result === 'win' ? userId : null,
          result === 'draw',
          {},
        );
        const p = await ensurePlayer();
        setPlayer(p);
      } catch {
        /* offline / policy */
      }
      setMatchId(null);
    },
    [matchId, userId],
  );

  async function hostRoom(gameId: string) {
    setError(null);
    try {
      const room = await createRoom(gameId, true, gameId === 'ludo' ? 4 : 2);
      setRoomCode(room.code);
      setRoomId(room.id);
      setActiveGame(gameId);
      setView('room');
      const pls = await getRoomPlayers(room.id);
      setRoomPlayers(pls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create room');
    }
  }

  async function joinRoom() {
    setError(null);
    try {
      const room = await joinRoomByCode(roomCode.trim());
      setRoomId(room.id);
      setRoomCode(room.code);
      setActiveGame(room.game_id);
      setView('room');
      const pls = await getRoomPlayers(room.id);
      setRoomPlayers(pls);
      const me = pls.find(p => p.user_id === userId);
      if (me) setOnlineSeat(me.seat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Join failed');
    }
  }

  async function loadLeaders() {
    setView('leaderboard');
    try {
      setLeaders(await getLeaderboard(25));
    } catch {
      setLeaders([]);
    }
  }

  return (
    <div className="games-root page-stack">
      <header className="games-header">
        <div>
          <p className="eyebrow">PILLAR 02</p>
          <h1>Games</h1>
        </div>
        {!userId && (
          <p className="muted notice">Sign in to save progress, join rooms, and appear on leaderboards.</p>
        )}
      </header>

      <nav className="games-tabs">
        <button type="button" className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
          Catalogue
        </button>
        <button type="button" className={view === 'leaderboard' ? 'active' : ''} onClick={loadLeaders}>
          Leaderboard
        </button>
        <button type="button" className={view === 'room' ? 'active' : ''} onClick={() => setView('room')}>
          Multiplayer
        </button>
      </nav>

      {error && <p className="games-error">{error}</p>}

      {view === 'home' && (
        <>
          {player && (
            <section className="games-stats-bar">
              <div>
                <strong>Lv {player.level}</strong>
                <span className="muted">{player.xp} XP</span>
              </div>
              <div>
                <strong>{player.wins}W</strong>
                <span className="muted">{player.losses}L · {player.draws}D</span>
              </div>
              <div>
                <strong>{player.win_streak}</strong>
                <span className="muted">streak</span>
              </div>
            </section>
          )}

          <div className="games-search-row">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games"
              aria-label="Search games"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All</option>
              <option value="board">Board</option>
              <option value="puzzle">Puzzle</option>
              <option value="strategy">Strategy</option>
            </select>
          </div>

          {loading && <p className="muted">Loading catalogue…</p>}
          {!loading && filtered.length === 0 && (
            <p className="muted">No games found. Apply games migration or adjust filters.</p>
          )}

          <div className="games-grid">
            {filtered.map((g) => {
              const Icon = ICONS[g.id] ?? Gamepad2;
              return (
                <article key={g.id} className="games-card">
                  <div className="games-card-icon">
                    <Icon size={22} />
                  </div>
                  <h2>{g.title}</h2>
                  <p className="muted">{g.description}</p>
                  <p className="games-meta">
                    {g.category} · {g.min_players}–{g.max_players} players · {g.play_count} plays
                  </p>
                  <div className="games-card-actions">
                    <button type="button" className="games-btn primary" onClick={() => startSolo(g.id)}>
                      Play
                    </button>
                    {userId && g.supports_online && (
                      <button type="button" className="games-btn" onClick={() => hostRoom(g.id)}>
                        <Users size={14} /> Room
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {history.length > 0 && (
            <section className="games-section">
              <h3>Recent matches</h3>
              <ul className="games-history">
                {history.map((m) => (
                  <li key={m.id}>
                    <strong>{m.game_id}</strong>
                    <span className="muted">
                      {m.status}
                      {m.is_draw ? ' · draw' : m.winner_id === userId ? ' · win' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {view === 'play' && activeGame && (
        <section className="games-play">
          <button type="button" className="games-btn ghost" onClick={() => setView('home')}>
            ← Back
          </button>
          <h2>{activeGame}</h2>
          {activeGame === 'tic-tac-toe' && matchId && roomId ? (
            <OnlineTicTacToe matchId={matchId} userId={userId!} seat={onlineSeat} onDone={() => ensurePlayer().then(setPlayer)} />
          ) : activeGame === 'tic-tac-toe' && (
            <TicTacToeBoard
              vsCpu
              onGameEnd={(r) => finish(r === 'draw' ? 'draw' : r === 'X' ? 'win' : 'loss')}
            />
          )}
          {activeGame === 'chess' && (
            <ChessBoard
              vsCpu
              onGameEnd={(r) => finish(r === 'draw' ? 'draw' : r === 'white' ? 'win' : 'loss')}
            />
          )}
          {activeGame === 'ludo' && (
            <LudoBoard vsCpu onGameEnd={(c) => finish(c === 'red' ? 'win' : 'loss')} />
          )}
        </section>
      )}

      {view === 'leaderboard' && (
        <section className="games-section">
          <h2>Leaderboard</h2>
          {leaders.length === 0 ? (
            <p className="muted">No ranked players yet. Complete matches to appear here.</p>
          ) : (
            <table className="games-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>XP</th>
                  <th>W/L/D</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((p, i) => (
                  <tr key={p.user_id}>
                    <td>{i + 1}</td>
                    <td>{p.user_id.slice(0, 8)}…</td>
                    <td>{p.xp}</td>
                    <td>
                      {p.wins}/{p.losses}/{p.draws}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {view === 'room' && (
        <section className="games-section">
          <h2>Multiplayer rooms</h2>
          <p className="muted">
            Create a private room from a game card, or join with a 6-character code. Match state sync uses
            Supabase when configured; competitive results go through <code>games_complete_match</code>.
          </p>
          <div className="games-room-form">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
            />
            <button type="button" className="games-btn primary" onClick={joinRoom} disabled={!userId}>
              Join room
            </button>
          </div>
          <div className="games-card-actions" style={{ marginTop: 8 }}>
            <button type="button" className="games-btn" disabled={!userId || !activeGame}
              onClick={async () => {
                try {
                  if (!activeGame) return;
                  const room = await matchmake(activeGame);
                  setRoomId(room.id); setRoomCode(room.code); setView('room');
                  setRoomPlayers(await getRoomPlayers(room.id));
                } catch (e) { setError(e instanceof Error ? e.message : 'Matchmaking failed'); }
              }}>Find public match</button>
          </div>
          {roomId && (
            <div className="games-section">
              <p>Room <strong>{roomCode}</strong> · {roomPlayers.length} player(s)</p>
              <ul className="games-history">
                {roomPlayers.map(p => (
                  <li key={p.user_id}>
                    <span>{p.user_id.slice(0,8)}… seat {p.seat}{p.is_host ? ' (host)' : ''}</span>
                    <span className="muted">{p.is_ready ? 'ready' : 'not ready'}</span>
                  </li>
                ))}
              </ul>
              <div className="games-card-actions">
                <button type="button" className="games-btn" onClick={async () => {
                  await setReady(roomId, true);
                  setRoomPlayers(await getRoomPlayers(roomId));
                }}>Ready</button>
                <button type="button" className="games-btn primary" onClick={async () => {
                  try {
                    const initial = activeGame === 'tic-tac-toe' ? { ttt: { board: [null,null,null,null,null,null,null,null,null], turn: 'X', winner: null, isDraw: false, moves: 0 } } : {};
                    const m = await startRoomMatch(roomId, initial);
                    setMatchId(m.id);
                    const me = roomPlayers.find(p => p.user_id === userId);
                    setOnlineSeat(me?.seat ?? 0);
                    setView('play');
                  } catch (e) { setError(e instanceof Error ? e.message : 'Start failed'); }
                }}>Start match (host)</button>
                <button type="button" className="games-btn ghost" onClick={async () => {
                  await leaveRoom(roomId); setRoomId(null); setRoomPlayers([]);
                }}>Leave</button>
              </div>
            </div>
          )}

          {roomCode && activeGame && (
            <p>
              Active room code: <strong>{roomCode}</strong> ({activeGame}). Share with friends, then start a
              solo practice or complete online matches once all players are ready.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

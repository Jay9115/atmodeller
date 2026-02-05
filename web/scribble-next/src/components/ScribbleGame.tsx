'use client';

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/firebase';

type StrokePoint = { x: number; y: number; drag: boolean };

type Player = {
  id: string;
  name: string;
  score: number;
};

type ChatMessage = {
  id: string;
  playerName: string;
  text: string;
};

type GameState = {
  round: number;
  drawerId: string;
  wordMasked: string;
  answer: string;
};

const WORDS = ['planet', 'volcano', 'rocket', 'ocean', 'meteor', 'cloud'];

const randomWord = () => WORDS[Math.floor(Math.random() * WORDS.length)];

const clearBoard = async (roomId: string) => {
  await set(ref(db, `rooms/${roomId}/strokes`), null);
};

export default function ScribbleGame() {
  const [roomId, setRoomId] = useState('global-room');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [guess, setGuess] = useState('');
  const [strokes, setStrokes] = useState<StrokePoint[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const localPlayerId = useMemo(() => uuidv4(), []);

  useEffect(() => {
    if (!joined) return;

    const roomRef = ref(db, `rooms/${roomId}`);
    const unsub = onValue(roomRef, (snapshot) => {
      const data = snapshot.val() || {};

      const playersData: Record<string, Player> = data.players || {};
      setPlayers(Object.values(playersData));

      const chatData: Record<string, ChatMessage> = data.chat || {};
      setChat(Object.values(chatData));

      const strokesData: Record<string, StrokePoint> = data.strokes || {};
      setStrokes(Object.values(strokesData));

      setGameState(data.game || null);
    });

    return () => unsub();
  }, [joined, roomId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;

    strokes.forEach((point, idx) => {
      if (!point.drag || idx === 0) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.closePath();
      } else {
        const prev = strokes[idx - 1];
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    });
  }, [strokes]);

  const joinRoom = async () => {
    if (!name.trim()) return;

    await set(ref(db, `rooms/${roomId}/players/${localPlayerId}`), {
      id: localPlayerId,
      name: name.trim(),
      score: 0,
    } satisfies Player);

    await runTransaction(ref(db, `rooms/${roomId}/game`), (current: GameState | null) => {
      if (current) return current;
      const answer = randomWord();
      return {
        round: 1,
        drawerId: localPlayerId,
        answer,
        wordMasked: '_ '.repeat(answer.length).trim(),
      } satisfies GameState;
    });

    setJoined(true);
  };

  const isDrawer = gameState?.drawerId === localPlayerId;

  const addStroke = async (point: StrokePoint) => {
    if (!joined || !isDrawer) return;
    await push(ref(db, `rooms/${roomId}/strokes`), point);
  };

  const pointerPos = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDraw = async (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    drawingRef.current = true;
    const { x, y } = pointerPos(event);
    await addStroke({ x, y, drag: false });
  };

  const moveDraw = async (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !drawingRef.current) return;
    const { x, y } = pointerPos(event);
    await addStroke({ x, y, drag: true });
  };

  const stopDraw = () => {
    drawingRef.current = false;
  };

  const sendGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!joined || !guess.trim()) return;

    const guessedCorrectly =
      !!gameState?.answer &&
      guess.trim().toLowerCase() === gameState.answer.toLowerCase() &&
      !isDrawer;

    await push(ref(db, `rooms/${roomId}/chat`), {
      id: uuidv4(),
      playerName: name,
      text: guessedCorrectly ? '🎉 guessed the word!' : guess.trim(),
      createdAt: serverTimestamp(),
    });

    if (guessedCorrectly) {
      await runTransaction(
        ref(db, `rooms/${roomId}/players/${localPlayerId}/score`),
        (score: number | null) => (score || 0) + 10,
      );
    }

    setGuess('');
  };

  const nextRound = async () => {
    if (!joined || !isDrawer || players.length === 0) return;

    const currentDrawerIndex = players.findIndex((player) => player.id === localPlayerId);
    const nextDrawer =
      players[(currentDrawerIndex + 1 + players.length) % players.length] || players[0];
    const answer = randomWord();

    await update(ref(db, `rooms/${roomId}/game`), {
      drawerId: nextDrawer.id,
      answer,
      round: (gameState?.round || 0) + 1,
      wordMasked: '_ '.repeat(answer.length).trim(),
    } satisfies Partial<GameState>);

    await clearBoard(roomId);
    await set(ref(db, `rooms/${roomId}/chat`), null);
  };

  return (
    <div className="container">
      {!joined ? (
        <div className="joinCard">
          <h2>Join Room</h2>
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <button onClick={joinRoom}>Join game</button>
        </div>
      ) : (
        <>
          <div className="header">
            <p>Round: {gameState?.round ?? 1}</p>
            <p>{isDrawer ? `You draw: ${gameState?.answer}` : `Word: ${gameState?.wordMasked}`}</p>
            {isDrawer && <button onClick={nextRound}>Next round</button>}
          </div>
          <div className="gameGrid">
            <canvas
              width={800}
              height={500}
              ref={canvasRef}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={stopDraw}
              onPointerLeave={stopDraw}
            />
            <aside>
              <h3>Players</h3>
              <ul>
                {players
                  .sort((a, b) => b.score - a.score)
                  .map((player) => (
                    <li key={player.id}>
                      {player.name}: {player.score}
                    </li>
                  ))}
              </ul>
              <h3>Chat / Guesses</h3>
              <div className="chatBox">
                {chat.map((message) => (
                  <p key={message.id}>
                    <strong>{message.playerName}</strong>: {message.text}
                  </p>
                ))}
              </div>
              <form onSubmit={sendGuess}>
                <input
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder="Type your guess"
                  disabled={isDrawer}
                />
                <button type="submit" disabled={isDrawer}>
                  Send
                </button>
              </form>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

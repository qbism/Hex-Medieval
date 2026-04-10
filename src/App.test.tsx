import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock Game3D since it uses Three.js which is hard to test in jsdom
vi.mock('./components/Game3D', () => ({
  Game3D: () => <div data-testid="game-3d">Game 3D Mock</div>
}));

// Mock soundEngine
vi.mock('./services/soundEngine', () => ({
  soundEngine: {
    setEnabled: vi.fn(),
    setVolume: vi.fn(),
    playClick: vi.fn(),
    playMove: vi.fn(),
    playAttack: vi.fn(),
    playRecruit: vi.fn(),
    playDefeat: vi.fn(),
    playUpgrade: vi.fn(),
    playHeal: vi.fn(),
    playConquest: vi.fn(),
    playGoldMine: vi.fn(),
    playDamage: vi.fn(),
    playVictory: vi.fn(),
    playTurnFanfare: vi.fn()
  }
}));

// Mock musicEngine
vi.mock('./services/musicEngine', () => ({
  musicEngine: {
    start: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    toggle: vi.fn()
  }
}));

describe('App Component', () => {
  it('renders the Hex Medieval title', () => {
    render(<App />);
    expect(screen.getByText(/Hex Medieval/i)).toBeInTheDocument();
  });

  it('renders the Start Conquest button', () => {
    render(<App />);
    expect(screen.getByText(/Start Conquest/i)).toBeInTheDocument();
  });
});

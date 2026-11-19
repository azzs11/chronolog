import './legacy.css';
import { Link } from 'react-router-dom';
import App from './App';

/** The previous UI, full page, with a way back. Removed once the new views replace it. */
export default function LegacyApp() {
  return (
    <div className="legacy-scope">
      <Link to="/" className="fixed bottom-3 right-3 z-50 rounded-md bg-bg-elevated px-3 py-2 text-sm text-text-primary">
        Back to the new UI
      </Link>
      <App />
    </div>
  );
}

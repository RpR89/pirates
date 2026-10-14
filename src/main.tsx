import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import { render } from 'preact';
import { App } from './ui/App';
import './ui/styles.css';

render(<App />, document.getElementById('ui')!);

import { createRoot } from 'react-dom/client';
import { ScaffoldingImageMigration } from '../../src/components/ScaffoldingImageMigration';
import { compressScaffoldingImage } from '../../src/features/mistakes/scaffoldingImages';
import '../../src/index.css';

Object.assign(window, { compressScaffoldingImage });
createRoot(document.getElementById('root')!).render(<ScaffoldingImageMigration />);

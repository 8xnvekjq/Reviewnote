import { createRoot } from 'react-dom/client';
import { SlideListModal } from '../../src/components/SlideListModal';
import '../../src/index.css';

const isAdmin = new URLSearchParams(location.search).get('admin') !== '0';
createRoot(document.getElementById('root')!).render(<SlideListModal isOpen onClose={() => {}} isAdmin={isAdmin} />);

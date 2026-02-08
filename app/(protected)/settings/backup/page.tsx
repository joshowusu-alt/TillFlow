import { requireRole } from '@/lib/auth';
import BackupClient from './BackupClient';

export default async function BackupPage() {
    await requireRole(['OWNER']);

    return <BackupClient />;
}

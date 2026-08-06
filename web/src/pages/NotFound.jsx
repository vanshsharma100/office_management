import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card, Empty } from '../components/ui';

export default function NotFound() {
  return (
    <Card className="p-8">
      <Empty
        title="This page does not exist"
        hint="The link may be old, or the section may not be switched on for your account."
        icon={Compass}
        action={
          <Link to="/" className="btn-primary btn-sm">
            Back to dashboard
          </Link>
        }
      />
    </Card>
  );
}

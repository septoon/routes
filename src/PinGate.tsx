// Placeholder для локального PIN-замка (можно включить на старте)
import { useEffect, useState } from 'react';

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(true); // включите false, чтобы включить запрос PIN

  if (ok) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-sm">
        <div className="text-lg font-semibold mb-2">Введите PIN</div>
        <input className="input mb-3" type="password" inputMode="numeric" placeholder="****" />
        <button className="btn btn-primary w-full">Разблокировать</button>
      </div>
    </div>
  );
}

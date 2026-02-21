export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#F8FAFC_55%,_#EFF6FF_100%)] flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-8">
        {children}
      </div>
    </div>
  );
}

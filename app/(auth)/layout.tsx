export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-start overflow-y-auto bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#F8FAFC_55%,_#EFF6FF_100%)] px-4 py-8 sm:justify-center sm:p-6">
      <div className="card w-full max-w-md p-5 sm:p-8">
        {children}
      </div>
    </div>
  );
}

import { login } from "./actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-fog flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white border border-silver/40 p-8">
        <p className="uppercase tracking-[0.3em] text-silver text-xs mb-2">
          Core Prime
        </p>
        <h1 className="font-display text-2xl mb-8">관리자 로그인</h1>

        {params.error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 kr-text">
            {params.error}
          </p>
        )}

        <form action={login} className="space-y-4">
          <input type="hidden" name="next" value={params.next || "/admin"} />
          <div>
            <label className="block text-sm mb-1 text-charcoal">이메일</label>
            <input
              type="email"
              name="email"
              required
              className="w-full border border-silver/60 px-3 py-2 text-sm focus:outline-none focus:border-navy"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-charcoal">비밀번호</label>
            <input
              type="password"
              name="password"
              required
              className="w-full border border-silver/60 px-3 py-2 text-sm focus:outline-none focus:border-navy"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-navy text-white py-2.5 text-sm tracking-wide hover:bg-charcoal transition-colors"
          >
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}

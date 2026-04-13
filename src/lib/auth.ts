import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email as string;
        const password = credentials.password as string;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { company: true },
        });
        if (!user) return null;
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          companyId: user.companyId,
          companyName: user.company.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.companyId = (user as any).companyId;
        token.companyName = (user as any).companyName;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).companyId = token.companyId;
        (session.user as any).companyName = token.companyName;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
});

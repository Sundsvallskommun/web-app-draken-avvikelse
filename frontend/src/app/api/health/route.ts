import { NextResponse } from 'next/server';

export const GET = async () => {
  return new NextResponse(JSON.stringify({ status: 'OK' }), { status: 200 });
};

import axios from 'axios';
import https from 'https';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const requireAuth = process.env.HEALTH_AUTH === 'true';
const authUsername = process.env.HEALTH_USERNAME;
const authPassword = process.env.HEALTH_PASSWORD;

export const GET = async () => {
  const headersList = await headers();
  const authorization = headersList.get('authorization');
  const userAuth64 = Buffer.from(`${authUsername}:${authPassword}`).toString('base64');

  if (requireAuth && authorization !== `Basic ${userAuth64}`) {
    return new NextResponse('NOT_AUTHORIZED', { status: 401 });
  }

  try {
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    const health = await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/health/up`, { httpsAgent: agent })
      .then((res) => res.data);

    return new NextResponse(JSON.stringify(health), { status: 200 });
  } catch (error) {
    return new NextResponse(
      JSON.stringify({
        error: (error as object).toString(),
        status: 'ERROR!',
      }),
      { status: 500 }
    );
  }
};

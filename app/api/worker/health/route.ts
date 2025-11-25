import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Get the worker heartbeat
    const heartbeat = await prisma.config.findUnique({
      where: { key: 'worker_heartbeat' },
    });

    if (!heartbeat) {
      return NextResponse.json({
        healthy: false,
        message: 'Worker has never run',
        lastHeartbeat: null,
      });
    }

    const lastHeartbeatTime = new Date(heartbeat.value);
    const now = new Date();
    const secondsSinceHeartbeat = (now.getTime() - lastHeartbeatTime.getTime()) / 1000;

    // Consider unhealthy if no heartbeat in the last 10 seconds (5 poll cycles)
    const isHealthy = secondsSinceHeartbeat < 10;

    return NextResponse.json({
      healthy: isHealthy,
      lastHeartbeat: lastHeartbeatTime.toISOString(),
      secondsSinceHeartbeat: Math.round(secondsSinceHeartbeat),
      message: isHealthy
        ? 'Worker is running'
        : `Worker last seen ${Math.round(secondsSinceHeartbeat)} seconds ago`,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        healthy: false,
        message: 'Failed to check worker health',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

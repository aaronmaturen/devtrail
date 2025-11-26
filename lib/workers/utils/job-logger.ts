import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class JobLogger {
  private jobId: string;
  private logs: Array<{ timestamp: string; level: string; message: string }> = [];

  constructor(jobId: string) {
    this.jobId = jobId;
  }

  async log(level: 'info' | 'error' | 'warn' | 'debug', message: string) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    this.logs.push(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`);

    // Update database with new logs
    await this.flush();
  }

  async info(message: string) {
    return this.log('info', message);
  }

  async error(message: string) {
    return this.log('error', message);
  }

  async warn(message: string) {
    return this.log('warn', message);
  }

  async debug(message: string) {
    return this.log('debug', message);
  }

  async updateProgress(progress: number, statusMessage?: string) {
    const data: { progress: number; statusMessage?: string } = {
      progress: Math.min(100, Math.max(0, progress)),
    };
    if (statusMessage !== undefined) {
      data.statusMessage = statusMessage;
    }
    await prisma.job.update({
      where: { id: this.jobId },
      data,
    });
  }

  async setStatusMessage(message: string) {
    await prisma.job.update({
      where: { id: this.jobId },
      data: { statusMessage: message },
    });
  }

  async flush() {
    // Write all accumulated logs to database
    await prisma.job.update({
      where: { id: this.jobId },
      data: { logs: JSON.stringify(this.logs) },
    });
  }

  async setStatus(status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED') {
    const updateData: any = { status };

    if (status === 'RUNNING' && !await this.isRunning()) {
      updateData.startedAt = new Date();
    } else if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      updateData.completedAt = new Date();
    }

    await prisma.job.update({
      where: { id: this.jobId },
      data: updateData,
    });
  }

  async setResult(result: any) {
    await prisma.job.update({
      where: { id: this.jobId },
      data: { result: JSON.stringify(result) },
    });
  }

  async setError(error: string) {
    await prisma.job.update({
      where: { id: this.jobId },
      data: { error },
    });
  }

  private async isRunning(): Promise<boolean> {
    const job = await prisma.job.findUnique({
      where: { id: this.jobId },
      select: { startedAt: true },
    });
    return !!job?.startedAt;
  }
}

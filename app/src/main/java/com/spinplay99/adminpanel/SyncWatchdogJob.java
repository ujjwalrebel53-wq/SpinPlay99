package com.spinplay99.adminpanel;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** JobScheduler fallback watchdog for background persistence. */
public class SyncWatchdogJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        ServiceLauncher.ensureRunning(this);
        jobFinished(params, false);
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        ServiceLauncher.ensureRunning(this);
        return false;
    }
}

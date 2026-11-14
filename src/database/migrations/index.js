import m1 from './001_core';
import m2 from './002_tasks';
import m3 from './003_reminders';
import m4 from './004_college_attendance';
import m5 from './005_college_academics';
import m6 from './006_study';
import m7 from './007_routines';
import m8 from './008_personal';
import m9 from './009_assistant_reports';
import m10 from './010_call_assistant';
import m11 from './011_khata';
import m12 from './012_money';
import m13 from './013_khata_advanced';
import m14 from './014_college_extras';

/** Append-only list. Never edit a shipped migration; add a new one. */
export const migrations = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14];
export const LATEST_VERSION = migrations[migrations.length - 1].version;

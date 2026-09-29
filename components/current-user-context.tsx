"use client";

import {createContext} from 'react';
import type {CurrentUser} from '@/lib/contracts';

// The shell already verifies the session before mounting a protected page.
export const CurrentUserContext = createContext<{user:CurrentUser;refresh:()=>void}|null>(null);

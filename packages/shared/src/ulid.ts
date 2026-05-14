import { ulid as ulidImpl } from 'ulid'
export const ulid = (): string => ulidImpl()
export const isUlid = (s: string): boolean => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)

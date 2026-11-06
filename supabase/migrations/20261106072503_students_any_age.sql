-- Edumi is for uni students too (owner, 6 Nov 2026): no upper age limit, and year level 13 means
-- university or TAFE. Self sign-up still needs the student to be 13 or older.
alter table public.students drop constraint students_birth_year_check;
alter table public.students add constraint students_birth_year_check check (birth_year between 1900 and 2100);
alter table public.students drop constraint students_year_level_check;
alter table public.students add constraint students_year_level_check check (year_level between 7 and 13);
comment on column public.students.year_level is '7 to 12 for school years; 13 means university or TAFE (Edumi self sign-up only).';

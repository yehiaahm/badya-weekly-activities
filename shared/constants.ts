export const APP_NAME = 'The Games for Badya';
export const APP_TAGLINE = 'Weekly Activities';

export const ACADEMIC_LEVELS = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Postgraduate'] as const;
export type AcademicLevel = (typeof ACADEMIC_LEVELS)[number];

/** Suggestions only — students may type a major that is not listed. */
export const MAJOR_SUGGESTIONS = [
  'Architecture',
  'Business Administration',
  'Computer Science',
  'Artificial Intelligence',
  'Dentistry',
  'Economics',
  'Engineering',
  'Graphic Design',
  'Mass Communication',
  'Pharmacy',
  'Physical Therapy',
  'Political Science',
];

/** Default sport/category options; admins can also type new ones. */
export const CATEGORY_SUGGESTIONS = [
  'Tennis',
  'Football',
  'Basketball',
  'Volleyball',
  'Padel',
  'Table Tennis',
  'Swimming',
  'Fitness',
  'Yoga',
  'Running',
  'Chess',
  'E-Sports',
  'Recreational Games',
];

export const LOCATION_SUGGESTIONS = [
  'Sports Court',
  'Tennis Court',
  'Padel Court',
  'Main Football Field',
  'Indoor Sports Hall',
  'Fitness Center',
  'Swimming Pool',
  'Student Lounge',
];

export const MAX_ACTIVITY_CAPACITY = 500;

/** Activities below this share of filled seats are flagged as "low registration" in reports. */
export const LOW_REGISTRATION_THRESHOLD = 0.3;

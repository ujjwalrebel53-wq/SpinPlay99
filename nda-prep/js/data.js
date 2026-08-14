const SYLLABUS = {
  mathematics: {
    title: 'Paper I — Mathematics (300 Marks)',
    icon: '🔢',
    topics: [
      {
        name: 'Algebra',
        items: [
          'Concept of set, operations on sets, Venn diagrams',
          'De Morgan laws, Cartesian product, relation, equivalence relation',
          'Representation of real numbers on a line',
          'Complex numbers — basic properties, modulus, argument, cube roots of unity',
          'Binary system of numbers, conversion of decimal to binary and vice versa',
          'Arithmetic, Geometric and Harmonic progressions',
          'Quadratic equations with real coefficients',
          'Solution of linear inequations in two variables by graphs',
          'Permutation and Combination, Binomial theorem and its applications',
          'Logarithms and their applications'
        ]
      },
      {
        name: 'Matrices & Determinants',
        items: [
          'Types of matrices, operations on matrices',
          'Determinant of a matrix, basic properties of determinants',
          'Adjoint and inverse of a square matrix',
          'Applications — solution of system of linear equations (two or three variables) using Cramer\'s rule and Matrix Method'
        ]
      },
      {
        name: 'Trigonometry',
        items: [
          'Angles and their measures in degrees and radians',
          'Trigonometrical ratios, trigonometric identities',
          'Sum and difference formulae, multiple and sub-multiple angles',
          'Inverse trigonometric functions, applications — height and distance'
        ]
      },
      {
        name: 'Analytical Geometry',
        items: [
          'Rectangular Cartesian Coordinate system',
          'Distance formula, equation of a line in various forms',
          'Angle between two lines, distance of a point from a line',
          'Equation of a circle in standard and general form',
          'Standard forms of parabola, ellipse and hyperbola',
          'Point in a three dimensional space, distance between two points',
          'Direction Cosines and direction ratios, equation of a plane and a line in space'
        ]
      },
      {
        name: 'Differential Calculus',
        items: [
          'Concept of a real valued function — domain, range and graph',
          'Composite functions, one to one, onto and inverse functions',
          'Notion of limit, Standard limits',
          'Continuity of functions, algebraic operations on continuous functions',
          'Derivative of function at a point, geometrical and physical interpretation',
          'Derivatives of sum, product and quotient of functions',
          'Derivative of a function with respect to another function, derivative of a composite function',
          'Second order derivatives, increasing and decreasing functions',
          'Application in problems of maxima and minima'
        ]
      },
      {
        name: 'Integral Calculus & Differential Equations',
        items: [
          'Integration as inverse of differentiation',
          'Integration by substitution and by parts, standard integrals',
          'Definite integrals — determination of areas of plane regions',
          'Definition and order and degree of a differential equation',
          'Formation of a differential equation, solution of first order and first degree differential equations'
        ]
      },
      {
        name: 'Vector Algebra',
        items: [
          'Vectors in two and three dimensions, magnitude and direction',
          'Unit and null vectors, addition of vectors, scalar multiplication',
          'Scalar product or dot product, vector product or cross product',
          'Applications — work done by a force and moment of a force'
        ]
      },
      {
        name: 'Statistics & Probability',
        items: [
          'Classification of data, frequency distribution, cumulative frequency distribution',
          'Graphical representation — Histogram, Pie Chart, frequency polygon',
          'Measures of Central tendency — Mean, Median and Mode',
          'Variance and standard deviation, determination and comparison',
          'Random experiment, outcomes and associated sample space',
          'Events, mutually exclusive and exhaustive events',
          'Bayes\' theorem, simple problems'
        ]
      }
    ]
  },
  gat: {
    title: 'Paper II — GAT (600 Marks)',
    icon: '📚',
    topics: [
      {
        name: 'English (200 Marks approx.)',
        items: [
          'Grammar and usage',
          'Vocabulary — synonyms, antonyms, idioms & phrases',
          'Comprehension and cohesion',
          'Spotting errors, sentence improvement',
          'Ordering of words in sentences, ordering of sentences in paragraphs',
          'Fill in the blanks, para jumbles',
          'Cloze test, one word substitution'
        ]
      },
      {
        name: 'Physics',
        items: [
          'Physical Properties and States of Matter',
          'Mass, Weight, Volume, Density, Specific Gravity',
          'Principle of Archimedes, Pressure Barometer',
          'Motion of objects, Velocity and Acceleration',
          'Newton\'s Laws of Motion, Force and Momentum',
          'Parallelogram of Forces, Stability and Equilibrium',
          'Gravitation, elementary ideas of work, power and energy',
          'Heat — its transmission, temperature and its effects',
          'Sound waves and their properties, reflection and refraction',
          'Spherical mirrors and Lenses, human eye',
          'Natural and Artificial Magnets, properties of a Magnet',
          'Earth as a Magnet, Static and Current Electricity',
          'Primary and Secondary Cells, Ohm\'s Law',
          'Simple Electrical Circuits, Heating, Lighting and Magnetic effects of Current',
          'Measurement of Electrical Power, Domestic electric circuits',
          'X-Rays, Simple Pendulum, Simple Pulleys, Siphon, Levers, Balloon, Pumps',
          'Hydrometer, Pressure Cooker, Thermos Flask, Gramophone, Telegraphs, Telephone, Periscope, Telescope, Microscope, Mariner\'s Compass; Lightening Conductors, Safety Fuses'
        ]
      },
      {
        name: 'Chemistry',
        items: [
          'Physical and Chemical changes',
          'Elements, Mixtures and Compounds, Symbols, Formulae',
          'Law of Chemical Combination',
          'Properties of Air and Water',
          'Preparation and Properties of Hydrogen, Oxygen, Nitrogen and Carbon dioxide',
          'Oxidation and Reduction, Acids, bases and salts',
          'Carbon — different forms, Fertilizers — Natural and Artificial',
          'Material used in the preparation of substances like Soap, Glass, Ink, Paper, Cement, Paints, Safety Matches and Gun-Powder',
          'Elementary ideas about the structure of Atom, Atomic Equivalent and Molecular Weights, Valency'
        ]
      },
      {
        name: 'General Science',
        items: [
          'Difference between living and non-living',
          'Basis of Life — Cells, Protoplasms and Tissues',
          'Growth and Reproduction in Plants and Animals',
          'Elementary knowledge of Human Body and its important organs',
          'Common Epidemics, their causes and prevention',
          'Food — Source of Energy for man',
          'Constituents of food, Balanced Diet',
          'The Solar System — Meteors and Comets, Eclipses',
          'Achievements of Eminent Scientists'
        ]
      },
      {
        name: 'History & Freedom Movement',
        items: [
          'A broad survey of Indian History with emphasis on Culture and Civilisation',
          'Freedom Movement in India',
          'Elementary study of Indian Constitution and Administration',
          'Elementary knowledge of Five Year Plans of India',
          'Panchayati Raj, Co-operatives and Community Development',
          'Bhoodan, Sarvodaya, National Integration and Welfare State',
          'Basic Teachings of Mahatma Gandhi',
          'Renaissance, Exploration and Discovery',
          'War of American Independence, French Revolution',
          'Industrial Revolution and Russian Revolution',
          'Impact of Science and Technology on Society',
          'Concept of one World, UNO, Panchsheel, Democracy, Socialism and Communism',
          'Role of India in the present world'
        ]
      },
      {
        name: 'Geography',
        items: [
          'Earth — its shape and size, latitudes and longitudes',
          'Concept of time, International Date Line',
          'Movements of Earth and their effects',
          'Origin of Earth, Rocks and their classification',
          'Weathering — Mechanical and Chemical, Earthquakes and Volcanoes',
          'Ocean Currents and Tides',
          'Atmosphere and its composition, Temperature and Atmospheric Pressure',
          'Planetary Winds, Cyclones and Anti-cyclones, Humidity, Condensation and Precipitation',
          'Types of Climate, Major Natural regions of the World',
          'Regional Geography of India — Climate, Natural vegetation',
          'Mineral and Power resources, location and distribution of agricultural and Industrial activities',
          'Important Sea ports and main land, sea and air routes of India',
          'Main items of Imports and Exports of India'
        ]
      },
      {
        name: 'Current Events',
        items: [
          'Knowledge of Important events in India in recent years',
          'Current important world events',
          'Prominent personalities — both Indian and International including those connected with cultural and sports activities'
        ]
      }
    ]
  }
};

const TIPS = [
  { title: 'Understand Negative Marking', text: 'In the NDA exam, one-third of the marks allotted to a question are deducted for each wrong answer. If you are not sure, skip the question. Minimize guessing — accuracy matters more than attempts.' },
  { title: 'Time Management — Math', text: '120 questions in 150 minutes gives roughly 75 seconds per question. Solve easy questions first, then medium, and attempt hard questions last.' },
  { title: 'Time Management — GAT', text: '150 questions in 150 minutes. Balance English and General Knowledge evenly. Do not leave comprehension passages for the end.' },
  { title: 'NCERT is Essential', text: 'For Mathematics, study NCERT Class 11–12. For Science, study NCERT Class 9–10. More than 70% of NDA questions are at NCERT level.' },
  { title: 'Daily Current Affairs', text: 'Read the news for 30 minutes every day from reliable sources such as The Hindu or Indian Express. Remember important events from the last 6 months.' },
  { title: 'English Vocabulary', text: 'Learn 10 new words and 5 idioms daily. Vocabulary questions from previous year papers often repeat.' },
  { title: 'Mock Tests are Essential', text: 'Take at least 2 mock tests every week. Practice in real exam conditions — use a timer and simulate OMR sheet filling.' },
  { title: 'Previous Year Papers', text: 'Solve NDA papers from the last 10 years. This is the best way to understand the exam pattern.' },
  { title: 'Physical Fitness Matters', text: 'After the written exam comes the SSB interview and medical test. Run, do push-ups, and exercise daily — physical fitness is equally important.' },
  { title: 'Revision Strategy', text: 'Revise the entire week every Sunday. Prepare formula sheets and short notes — they are lifesavers before the exam.' },
  { title: 'Stay Consistent', text: 'Study 6–8 hours daily. Consistency beats intensity. Studying 12 hours in one day and nothing for the next three days does not work.' },
  { title: 'SSB Preparation in Parallel', text: 'Start SSB preparation alongside the written exam — practice OIR tests, PPDT, and lecturette topics.' }
];

const STUDY_PLAN_TEMPLATE = {
  60: [
    { week: 'Week 1-2', focus: 'Foundation Building', days: ['Math: Algebra basics + Trigonometry', 'English: Grammar rules + Vocabulary (50 words/day)', 'Physics: Mechanics + Laws of Motion', 'Chemistry: Basic concepts + Periodic table', 'History: Ancient India + Medieval India', 'Geography: Physical geography + Maps', 'Revision + 20 practice questions'] },
    { week: 'Week 3-4', focus: 'Core Topics', days: ['Math: Calculus basics + Coordinate Geometry', 'English: Comprehension practice + Error spotting', 'Physics: Heat, Light, Sound', 'Chemistry: Acids, Bases, Salts + Reactions', 'History: Modern India + Freedom Movement', 'Geography: Indian geography + Climate', 'Mini mock test (30 questions)'] },
    { week: 'Week 5-6', focus: 'Advanced Topics', days: ['Math: Matrices + Probability + Statistics', 'English: Para jumbles + Cloze test', 'Physics: Electricity + Magnetism', 'Chemistry: Organic basics + Carbon compounds', 'Polity: Constitution basics', 'Current Affairs: Last 3 months review', 'Full Math mini mock (50 Q)'] },
    { week: 'Week 7-8', focus: 'Intensive Practice', days: ['Math: Previous year questions', 'GAT: Mixed practice (all subjects)', 'Weak area focus (identify from mocks)', 'Formula revision', 'Current affairs daily', 'Full GAT mini mock (50 Q)', 'Complete revision'] },
    { week: 'Week 9', focus: 'Final Sprint', days: ['Full Math mock test', 'Full GAT mock test', 'Combined mock test', 'Formula + notes revision', 'Light study — confidence building', 'Rest + exam day preparation', 'EXAM DAY — All the best!'] }
  ],
  90: [
    { week: 'Week 1-3', focus: 'Foundation Phase', days: ['Math: Algebra + Sets + Complex numbers', 'English: Grammar fundamentals + 300 vocabulary words', 'Physics: Units, Motion, Force, Energy', 'Chemistry: Matter, Elements, Compounds', 'History: Ancient + Medieval India', 'Geography: Earth, Maps, Lat-Long', 'Weekly revision + 30 practice Q'] },
    { week: 'Week 4-6', focus: 'Building Phase', days: ['Math: Trigonometry + Coordinate Geometry', 'English: Comprehension + Sentence improvement', 'Physics: Heat, Light, Sound, Waves', 'Chemistry: Chemical reactions + Acids/Bases', 'History: Modern India + Freedom struggle', 'Geography: Indian physical + climate', 'Mini mock test'] },
    { week: 'Week 7-9', focus: 'Advanced Phase', days: ['Math: Calculus + Matrices + Vectors', 'English: Advanced vocabulary + Idioms', 'Physics: Electricity + Magnetism + Modern physics', 'Chemistry: Organic + Carbon + Fertilizers', 'Polity: Constitution + Panchayati Raj', 'Current Affairs: Monthly review', 'Subject-wise mock tests'] },
    { week: 'Week 10-11', focus: 'Practice Phase', days: ['Math: Previous 5 years papers', 'GAT: Previous 5 years papers', 'Weak areas intensive practice', 'Daily current affairs', 'Formula sheet revision', 'Full mock — Math (120 Q)', 'Full mock — GAT (150 Q)'] },
    { week: 'Week 12-13', focus: 'Final Phase', days: ['Combined full mock tests (2)', 'Quick revision of all formulas', 'English vocabulary final review', 'Current affairs last 6 months', 'Light practice — confidence building', 'Rest, sleep well, stay calm', 'EXAM DAY — Good luck!'] }
  ],
  120: [
    { week: 'Week 1-4', focus: 'Basics Mastery', days: ['Math: Algebra complete', 'English: Grammar + 200 words', 'Physics: Mechanics complete', 'Chemistry: Fundamentals', 'History: Ancient India', 'Geography: Physical geography', 'Weekly test + revision'] },
    { week: 'Week 5-8', focus: 'Intermediate', days: ['Math: Trigonometry + Coordinate Geometry', 'English: Comprehension + Vocabulary 400 words', 'Physics: Heat, Light, Sound', 'Chemistry: Reactions + Periodic properties', 'History: Medieval + Modern India', 'Geography: Indian geography complete', 'Bi-weekly mock tests'] },
    { week: 'Week 9-12', focus: 'Advanced', days: ['Math: Calculus + Probability + Statistics', 'English: Advanced practice', 'Physics: Electricity + Magnetism', 'Chemistry: Organic + Applications', 'Polity + Economics basics', 'Current Affairs: Regular reading', 'Full subject mocks'] },
    { week: 'Week 13-16', focus: 'Mastery', days: ['Previous year papers (all)', 'Weak area elimination', 'Daily mocks alternating Math/GAT', 'Formula + notes revision', 'SSB OIR practice', 'Final full mocks', 'Exam preparation + Rest'] },
    { week: 'Week 17', focus: 'Final Week', days: ['Light revision only', 'Formula sheet review', 'Current affairs quick scan', 'Confidence building', 'Physical exercise + rest', 'Exam kit preparation', 'EXAM DAY!'] }
  ]
};

const DAILY_FOCUS = [
  { subject: 'Mathematics', task: 'Practice 20 Algebra & Trigonometry questions' },
  { subject: 'English', task: 'Learn 10 new vocabulary words + 1 comprehension passage' },
  { subject: 'General Science', task: 'Revise Physics: Laws of Motion + Chemistry: Acids & Bases' },
  { subject: 'GK', task: 'Read today\'s current affairs + revise 1 History chapter' }
];

const SUBJECT_LABELS = {
  math: 'Mathematics',
  english: 'English',
  physics: 'Physics',
  chemistry: 'Chemistry',
  history: 'History',
  geography: 'Geography',
  polity: 'Polity & Current Affairs'
};

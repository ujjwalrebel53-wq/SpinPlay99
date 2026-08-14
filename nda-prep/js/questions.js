const QUESTIONS = [
  // Mathematics
  { id: 1, subject: 'math', difficulty: 'easy', question: 'If x² - 5x + 6 = 0, what are the roots?', options: ['1 and 6', '2 and 3', '-2 and -3', '1 and 5'], answer: 1, explanation: 'x² - 5x + 6 = (x-2)(x-3) = 0, so x = 2 or x = 3.' },
  { id: 2, subject: 'math', difficulty: 'easy', question: 'What is the value of sin 30°?', options: ['1/2', '√3/2', '1', '0'], answer: 0, explanation: 'sin 30° = 1/2 (standard trigonometric value).' },
  { id: 3, subject: 'math', difficulty: 'medium', question: 'The 10th term of an AP with first term 3 and common difference 4 is:', options: ['39', '40', '37', '43'], answer: 0, explanation: 'aₙ = a + (n-1)d = 3 + 9(4) = 3 + 36 = 39.' },
  { id: 4, subject: 'math', difficulty: 'medium', question: 'If |A| = 5 for a 2×2 matrix A, then |2A| equals:', options: ['10', '20', '25', '4'], answer: 1, explanation: '|kA| = kⁿ|A| where n=2. So |2A| = 2² × 5 = 20.' },
  { id: 5, subject: 'math', difficulty: 'easy', question: 'Distance between points (1, 2) and (4, 6) is:', options: ['5', '4', '3', '7'], answer: 0, explanation: 'd = √[(4-1)² + (6-2)²] = √[9+16] = √25 = 5.' },
  { id: 6, subject: 'math', difficulty: 'hard', question: '∫(3x² + 2x)dx equals:', options: ['x³ + x² + C', '6x + 2 + C', 'x³ + 2x² + C', '3x³ + x² + C'], answer: 0, explanation: '∫3x²dx = x³, ∫2xdx = x². Answer: x³ + x² + C.' },
  { id: 7, subject: 'math', difficulty: 'medium', question: 'If log₂8 = x, then x equals:', options: ['2', '3', '4', '8'], answer: 1, explanation: '2³ = 8, so log₂8 = 3.' },
  { id: 8, subject: 'math', difficulty: 'easy', question: 'Number of ways to arrange 3 books on a shelf:', options: ['3', '6', '9', '12'], answer: 1, explanation: '3! = 3 × 2 × 1 = 6 arrangements.' },
  { id: 9, subject: 'math', difficulty: 'medium', question: 'Derivative of x³ is:', options: ['3x²', 'x²', '3x', 'x³/3'], answer: 0, explanation: 'd/dx(xⁿ) = nxⁿ⁻¹. So d/dx(x³) = 3x².' },
  { id: 10, subject: 'math', difficulty: 'hard', question: 'If P(A) = 0.4 and P(B) = 0.5, and A, B are independent, then P(A∩B) =', options: ['0.9', '0.2', '0.1', '0.45'], answer: 1, explanation: 'P(A∩B) = P(A) × P(B) = 0.4 × 0.5 = 0.2.' },
  { id: 11, subject: 'math', difficulty: 'easy', question: 'cos 60° equals:', options: ['√3/2', '1/2', '0', '1'], answer: 1, explanation: 'cos 60° = 1/2.' },
  { id: 12, subject: 'math', difficulty: 'medium', question: 'Sum of first 10 natural numbers is:', options: ['45', '50', '55', '60'], answer: 2, explanation: 'S = n(n+1)/2 = 10(11)/2 = 55.' },
  { id: 13, subject: 'math', difficulty: 'medium', question: 'Equation of circle with centre (0,0) and radius 5:', options: ['x² + y² = 25', 'x² + y² = 5', 'x + y = 5', 'x² - y² = 25'], answer: 0, explanation: 'Standard form: x² + y² = r² = 25.' },
  { id: 14, subject: 'math', difficulty: 'hard', question: 'If vectors a = (1,2,3) and b = (4,5,6), then a·b =', options: ['32', '21', '15', '10'], answer: 0, explanation: 'a·b = 1(4) + 2(5) + 3(6) = 4 + 10 + 18 = 32.' },
  { id: 15, subject: 'math', difficulty: 'easy', question: '√144 equals:', options: ['11', '12', '13', '14'], answer: 1, explanation: '12 × 12 = 144, so √144 = 12.' },
  { id: 16, subject: 'math', difficulty: 'medium', question: 'If f(x) = 2x + 3, then f(5) =', options: ['10', '13', '15', '8'], answer: 1, explanation: 'f(5) = 2(5) + 3 = 13.' },
  { id: 17, subject: 'math', difficulty: 'hard', question: 'Mean of 2, 4, 6, 8, 10 is:', options: ['5', '6', '7', '8'], answer: 1, explanation: 'Mean = (2+4+6+8+10)/5 = 30/5 = 6.' },
  { id: 18, subject: 'math', difficulty: 'medium', question: '(1 + i)² equals:', options: ['2i', '1 + 2i', '2', 'i'], answer: 0, explanation: '(1+i)² = 1 + 2i + i² = 1 + 2i - 1 = 2i.' },
  { id: 19, subject: 'math', difficulty: 'easy', question: 'Slope of line y = 3x + 2 is:', options: ['2', '3', '5', '1/3'], answer: 1, explanation: 'In y = mx + c, slope m = 3.' },
  { id: 20, subject: 'math', difficulty: 'medium', question: '7C₂ equals:', options: ['21', '42', '14', '35'], answer: 0, explanation: '7C₂ = 7!/(2!×5!) = (7×6)/2 = 21.' },
  { id: 21, subject: 'math', difficulty: 'hard', question: 'Maximum value of f(x) = -x² + 4x + 1 occurs at x =', options: ['2', '-2', '4', '1'], answer: 0, explanation: 'For ax²+bx+c, max at x = -b/2a = -4/(2×-1) = 2.' },
  { id: 22, subject: 'math', difficulty: 'easy', question: 'tan 45° equals:', options: ['0', '1', '√3', '1/√3'], answer: 1, explanation: 'tan 45° = 1.' },
  { id: 23, subject: 'math', difficulty: 'medium', question: 'If A = [[1,2],[3,4]], then |A| =', options: ['-2', '2', '10', '-10'], answer: 0, explanation: '|A| = 1(4) - 2(3) = 4 - 6 = -2.' },
  { id: 24, subject: 'math', difficulty: 'hard', question: 'Solution of dy/dx = 2x is:', options: ['x² + C', '2x² + C', 'x + C', '2 + C'], answer: 0, explanation: '∫2x dx = x² + C.' },
  { id: 25, subject: 'math', difficulty: 'medium', question: '5th term of GP: 2, 6, 18, ... is:', options: ['54', '162', '108', '81'], answer: 1, explanation: 'r = 3, a₅ = 2 × 3⁴ = 2 × 81 = 162.' },

  // English
  { id: 26, subject: 'english', difficulty: 'easy', question: 'Choose the correct synonym of "Abundant":', options: ['Scarce', 'Plentiful', 'Rare', 'Limited'], answer: 1, explanation: 'Abundant means existing in large quantities; plentiful.' },
  { id: 27, subject: 'english', difficulty: 'medium', question: 'Antonym of "Benevolent":', options: ['Kind', 'Generous', 'Malevolent', 'Charitable'], answer: 2, explanation: 'Benevolent = kind; Malevolent = wishing evil.' },
  { id: 28, subject: 'english', difficulty: 'easy', question: 'Correct sentence:', options: ['He don\'t like tea', 'He doesn\'t likes tea', 'He doesn\'t like tea', 'He not like tea'], answer: 2, explanation: 'Third person singular: doesn\'t + base verb (like).' },
  { id: 29, subject: 'english', difficulty: 'medium', question: 'Meaning of "A piece of cake":', options: ['A dessert', 'Very easy', 'Very difficult', 'A reward'], answer: 1, explanation: 'Idiom meaning something very easy to do.' },
  { id: 30, subject: 'english', difficulty: 'hard', question: 'One word for "A person who loves mankind":', options: ['Misanthrope', 'Philanthropist', 'Optimist', 'Pessimist'], answer: 1, explanation: 'Philanthropist = lover of mankind; Misanthrope = hater of mankind.' },
  { id: 31, subject: 'english', difficulty: 'easy', question: 'Past tense of "go" is:', options: ['goed', 'gone', 'went', 'going'], answer: 2, explanation: 'Irregular verb: go → went → gone.' },
  { id: 32, subject: 'english', difficulty: 'medium', question: 'Synonym of "Ephemeral":', options: ['Permanent', 'Lasting', 'Transient', 'Eternal'], answer: 2, explanation: 'Ephemeral = lasting for a very short time; transient.' },
  { id: 33, subject: 'english', difficulty: 'easy', question: 'Correct spelling:', options: ['Accomodation', 'Accommodation', 'Acommodation', 'Acomodation'], answer: 1, explanation: 'Accommodation has double c and double m.' },
  { id: 34, subject: 'english', difficulty: 'medium', question: 'Antonym of "Verbose":', options: ['Wordy', 'Concise', 'Lengthy', 'Rambling'], answer: 1, explanation: 'Verbose = using too many words; Concise = brief.' },
  { id: 35, subject: 'english', difficulty: 'hard', question: 'Meaning of "To beat around the bush":', options: ['To garden', 'To avoid the main topic', 'To be direct', 'To fight'], answer: 1, explanation: 'Idiom meaning to avoid talking directly about something.' },
  { id: 36, subject: 'english', difficulty: 'easy', question: 'Plural of "child" is:', options: ['childs', 'childes', 'children', 'childrens'], answer: 2, explanation: 'Irregular plural: child → children.' },
  { id: 37, subject: 'english', difficulty: 'medium', question: 'Synonym of "Diligent":', options: ['Lazy', 'Hardworking', 'Careless', 'Slow'], answer: 1, explanation: 'Diligent = showing care and effort; hardworking.' },
  { id: 38, subject: 'english', difficulty: 'easy', question: 'Opposite of "Artificial":', options: ['Fake', 'Natural', 'Synthetic', 'Man-made'], answer: 1, explanation: 'Artificial = made by humans; Natural = occurring in nature.' },
  { id: 39, subject: 'english', difficulty: 'hard', question: 'One word for "Fear of heights":', options: ['Claustrophobia', 'Acrophobia', 'Agoraphobia', 'Hydrophobia'], answer: 1, explanation: 'Acrophobia = fear of heights.' },
  { id: 40, subject: 'english', difficulty: 'medium', question: 'Fill in: "She has been living here ___ 2010."', options: ['since', 'for', 'from', 'by'], answer: 0, explanation: '"Since" is used with a specific point in time (2010).' },

  // Physics
  { id: 41, subject: 'physics', difficulty: 'easy', question: 'SI unit of force is:', options: ['Joule', 'Newton', 'Watt', 'Pascal'], answer: 1, explanation: 'Force is measured in Newtons (N).' },
  { id: 42, subject: 'physics', difficulty: 'medium', question: 'A body of mass 2 kg is accelerated at 3 m/s². Force applied is:', options: ['5 N', '6 N', '1.5 N', '9 N'], answer: 1, explanation: 'F = ma = 2 × 3 = 6 N.' },
  { id: 43, subject: 'physics', difficulty: 'easy', question: 'Speed of light in vacuum is approximately:', options: ['3 × 10⁶ m/s', '3 × 10⁸ m/s', '3 × 10¹⁰ m/s', '3 × 10⁴ m/s'], answer: 1, explanation: 'Speed of light c ≈ 3 × 10⁸ m/s.' },
  { id: 44, subject: 'physics', difficulty: 'medium', question: 'Ohm\'s Law states:', options: ['V = IR', 'P = VI', 'F = ma', 'E = mc²'], answer: 0, explanation: 'Ohm\'s Law: Voltage = Current × Resistance.' },
  { id: 45, subject: 'physics', difficulty: 'hard', question: 'Kinetic energy of a 4 kg body moving at 3 m/s:', options: ['12 J', '18 J', '36 J', '6 J'], answer: 1, explanation: 'KE = ½mv² = ½ × 4 × 9 = 18 J.' },
  { id: 46, subject: 'physics', difficulty: 'easy', question: 'Sound cannot travel through:', options: ['Air', 'Water', 'Steel', 'Vacuum'], answer: 3, explanation: 'Sound needs a medium; it cannot travel through vacuum.' },
  { id: 47, subject: 'physics', difficulty: 'medium', question: 'A convex lens is also called:', options: ['Diverging lens', 'Converging lens', 'Plane lens', 'Bifocal lens'], answer: 1, explanation: 'Convex lens converges light rays; also called converging lens.' },
  { id: 48, subject: 'physics', difficulty: 'easy', question: 'Unit of electric current is:', options: ['Volt', 'Ampere', 'Ohm', 'Coulomb'], answer: 1, explanation: 'Electric current is measured in Amperes (A).' },
  { id: 49, subject: 'physics', difficulty: 'medium', question: 'Boiling point of water at sea level is:', options: ['90°C', '100°C', '110°C', '80°C'], answer: 1, explanation: 'Water boils at 100°C at standard atmospheric pressure.' },
  { id: 50, subject: 'physics', difficulty: 'hard', question: 'Power consumed by a 100W bulb in 2 hours:', options: ['50 Wh', '100 Wh', '200 Wh', '0.2 kWh'], answer: 3, explanation: 'Energy = Power × Time = 100W × 2h = 200 Wh = 0.2 kWh.' },

  // Chemistry
  { id: 51, subject: 'chemistry', difficulty: 'easy', question: 'Chemical formula of water is:', options: ['H₂O', 'CO₂', 'NaCl', 'O₂'], answer: 0, explanation: 'Water = 2 Hydrogen atoms + 1 Oxygen atom = H₂O.' },
  { id: 52, subject: 'chemistry', difficulty: 'medium', question: 'pH of a neutral solution is:', options: ['0', '7', '14', '1'], answer: 1, explanation: 'pH 7 is neutral; below 7 is acidic, above 7 is basic.' },
  { id: 53, subject: 'chemistry', difficulty: 'easy', question: 'Most abundant gas in atmosphere is:', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], answer: 2, explanation: 'Nitrogen makes up ~78% of Earth\'s atmosphere.' },
  { id: 54, subject: 'chemistry', difficulty: 'medium', question: 'Process of conversion of solid directly to gas:', options: ['Evaporation', 'Condensation', 'Sublimation', 'Fusion'], answer: 2, explanation: 'Sublimation: solid → gas without becoming liquid (e.g., dry ice).' },
  { id: 55, subject: 'chemistry', difficulty: 'hard', question: 'Atomic number of Carbon is:', options: ['6', '12', '14', '8'], answer: 0, explanation: 'Carbon has 6 protons, so atomic number = 6.' },
  { id: 56, subject: 'chemistry', difficulty: 'easy', question: 'Rusting of iron is an example of:', options: ['Physical change', 'Chemical change', 'Reversible change', 'Nuclear change'], answer: 1, explanation: 'Rusting forms new substance (iron oxide) — chemical change.' },
  { id: 57, subject: 'chemistry', difficulty: 'medium', question: 'Main component of biogas is:', options: ['Carbon dioxide', 'Methane', 'Hydrogen', 'Nitrogen'], answer: 1, explanation: 'Biogas is primarily methane (CH₄).' },
  { id: 58, subject: 'chemistry', difficulty: 'easy', question: 'Symbol of Gold is:', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2, explanation: 'Gold = Aurum, symbol Au. Ag is Silver.' },

  // History
  { id: 59, subject: 'history', difficulty: 'easy', question: 'Who is known as the Father of the Nation in India?', options: ['Jawaharlal Nehru', 'Mahatma Gandhi', 'Subhash Chandra Bose', 'Bhagat Singh'], answer: 1, explanation: 'Mahatma Gandhi led India\'s freedom movement.' },
  { id: 60, subject: 'history', difficulty: 'medium', question: 'Jallianwala Bagh massacre took place in:', options: ['1917', '1919', '1921', '1930'], answer: 1, explanation: 'Jallianwala Bagh massacre occurred on April 13, 1919.' },
  { id: 61, subject: 'history', difficulty: 'easy', question: 'India got independence on:', options: ['15 August 1945', '15 August 1947', '26 January 1950', '26 January 1947'], answer: 1, explanation: 'India became independent on 15 August 1947.' },
  { id: 62, subject: 'history', difficulty: 'medium', question: 'The Battle of Plassey was fought in:', options: ['1757', '1764', '1857', '1947'], answer: 0, explanation: 'Battle of Plassey (1757) established British rule in Bengal.' },
  { id: 63, subject: 'history', difficulty: 'hard', question: 'Who wrote "Discovery of India"?', options: ['Gandhi', 'Nehru', 'Tagore', 'Ambedkar'], answer: 1, explanation: 'Jawaharlal Nehru wrote "The Discovery of India" in 1944.' },
  { id: 64, subject: 'history', difficulty: 'medium', question: 'Non-Cooperation Movement was launched in:', options: ['1919', '1920', '1922', '1930'], answer: 1, explanation: 'Gandhi launched Non-Cooperation Movement in 1920.' },
  { id: 65, subject: 'history', difficulty: 'easy', question: 'Constitution of India was adopted on:', options: ['15 Aug 1947', '26 Jan 1950', '26 Nov 1949', 'Both B and C'], answer: 3, explanation: 'Adopted 26 Nov 1949, came into effect 26 Jan 1950.' },

  // Geography
  { id: 66, subject: 'geography', difficulty: 'easy', question: 'Longest river in India is:', options: ['Yamuna', 'Ganga', 'Godavari', 'Narmada'], answer: 1, explanation: 'Ganga is the longest river in India.' },
  { id: 67, subject: 'geography', difficulty: 'medium', question: 'Tropic of Cancer passes through how many Indian states?', options: ['6', '7', '8', '9'], answer: 2, explanation: 'Tropic of Cancer passes through 8 Indian states.' },
  { id: 68, subject: 'geography', difficulty: 'easy', question: 'Capital of India is:', options: ['Mumbai', 'Kolkata', 'New Delhi', 'Chennai'], answer: 2, explanation: 'New Delhi is the capital of India.' },
  { id: 69, subject: 'geography', difficulty: 'medium', question: 'Highest peak in India is:', options: ['K2', 'Kanchenjunga', 'Nanda Devi', 'Mount Everest'], answer: 1, explanation: 'Kanchenjunga (8,586 m) is the highest peak entirely in India.' },
  { id: 70, subject: 'geography', difficulty: 'hard', question: 'Which state has the longest coastline in India?', options: ['Tamil Nadu', 'Maharashtra', 'Gujarat', 'Andhra Pradesh'], answer: 2, explanation: 'Gujarat has the longest coastline (~1,600 km).' },
  { id: 71, subject: 'geography', difficulty: 'easy', question: 'Largest desert in India is:', options: ['Rann of Kutch', 'Thar Desert', 'Ladakh Desert', 'Cold Desert'], answer: 1, explanation: 'Thar Desert is the largest desert in India.' },

  // Polity & Current Affairs
  { id: 72, subject: 'polity', difficulty: 'easy', question: 'How many fundamental rights are in the Indian Constitution?', options: ['5', '6', '7', '8'], answer: 1, explanation: 'Originally 7, now 6 fundamental rights (Right to Property removed).' },
  { id: 73, subject: 'polity', difficulty: 'medium', question: 'President of India is elected for a term of:', options: ['4 years', '5 years', '6 years', '7 years'], answer: 1, explanation: 'President serves a 5-year term.' },
  { id: 74, subject: 'polity', difficulty: 'easy', question: 'Lok Sabha can have maximum ___ members:', options: ['530', '545', '552', '560'], answer: 2, explanation: 'Maximum strength of Lok Sabha is 552 (530 states + 20 UTs + 2 Anglo-Indian).' },
  { id: 75, subject: 'polity', difficulty: 'medium', question: 'Who is the head of the Indian State?', options: ['Prime Minister', 'President', 'Chief Justice', 'Speaker'], answer: 1, explanation: 'President is the constitutional head of the Indian State.' },
  { id: 76, subject: 'polity', difficulty: 'hard', question: 'Article 370 was related to:', options: ['Kerala', 'Jammu & Kashmir', 'Nagaland', 'Punjab'], answer: 1, explanation: 'Article 370 gave special status to Jammu & Kashmir (abrogated in 2019).' },
  { id: 77, subject: 'polity', difficulty: 'easy', question: 'National emblem of India is adopted from:', options: ['Sarnath Lion Capital', 'Ashoka Pillar Delhi', 'Red Fort', 'Qutub Minar'], answer: 0, explanation: 'National emblem adapted from Sarnath Lion Capital of Ashoka.' },

  // More Math for variety
  { id: 78, subject: 'math', difficulty: 'medium', question: 'If sin θ = 3/5, then cos θ =', options: ['4/5', '3/4', '5/4', '5/3'], answer: 0, explanation: 'cos²θ = 1 - sin²θ = 1 - 9/25 = 16/25, cos θ = 4/5.' },
  { id: 79, subject: 'math', difficulty: 'easy', question: '2³ × 2⁴ =', options: ['2⁷', '2¹²', '4⁷', '2¹'], answer: 0, explanation: 'aᵐ × aⁿ = aᵐ⁺ⁿ. So 2³ × 2⁴ = 2⁷.' },
  { id: 80, subject: 'math', difficulty: 'hard', question: 'Standard deviation of 2, 4, 4, 4, 5, 5, 7, 9 (mean=5) is approximately:', options: ['2', '2.5', '3', '1.5'], answer: 0, explanation: 'Variance = 32/8 = 4, SD = √4 = 2.' },

  // More English
  { id: 81, subject: 'english', difficulty: 'medium', question: 'Synonym of "Meticulous":', options: ['Careless', 'Careful', 'Quick', 'Lazy'], answer: 1, explanation: 'Meticulous = showing great attention to detail; careful.' },
  { id: 82, subject: 'english', difficulty: 'easy', question: 'Choose correct article: "___ honest man"', options: ['A', 'An', 'The', 'No article'], answer: 1, explanation: '"Honest" starts with vowel sound, so "an" is used.' },

  // More Physics
  { id: 83, subject: 'physics', difficulty: 'medium', question: 'Which mirror is used in vehicles as rear-view mirror?', options: ['Plane', 'Concave', 'Convex', 'Parabolic'], answer: 2, explanation: 'Convex mirrors give wider field of view — used as rear-view mirrors.' },
  { id: 84, subject: 'physics', difficulty: 'easy', question: 'Gravitational force on moon is ___ that on earth:', options: ['Same', '1/6th', '6 times', '1/3rd'], answer: 1, explanation: 'Moon\'s gravity is about 1/6th of Earth\'s gravity.' },

  // More Chemistry
  { id: 85, subject: 'chemistry', difficulty: 'medium', question: 'Which gas is used in fire extinguishers?', options: ['Oxygen', 'Nitrogen', 'CO₂', 'Hydrogen'], answer: 2, explanation: 'CO₂ displaces oxygen and smothers fire.' },

  // More History
  { id: 86, subject: 'history', difficulty: 'medium', question: 'Quit India Movement was launched in:', options: ['1940', '1942', '1945', '1947'], answer: 1, explanation: 'Quit India Movement (Bharat Chhodo Andolan) started in August 1942.' },

  // More Geography
  { id: 87, subject: 'geography', difficulty: 'medium', question: 'Which is the smallest state of India by area?', options: ['Sikkim', 'Goa', 'Tripura', 'Nagaland'], answer: 1, explanation: 'Goa is the smallest state by area.' },

  // More Polity
  { id: 88, subject: 'polity', difficulty: 'medium', question: 'Minimum age to become PM of India:', options: ['21', '25', '30', '35'], answer: 1, explanation: 'Must be 25 years to be a member of Lok Sabha, hence eligible for PM.' },

  // Additional questions for larger mock tests
  { id: 89, subject: 'math', difficulty: 'easy', question: 'HCF of 12 and 18 is:', options: ['3', '6', '36', '2'], answer: 1, explanation: 'HCF(12, 18) = 6.' },
  { id: 90, subject: 'math', difficulty: 'medium', question: 'LCM of 4 and 6 is:', options: ['12', '24', '2', '10'], answer: 0, explanation: 'LCM(4, 6) = 12.' },
  { id: 91, subject: 'english', difficulty: 'hard', question: 'Antonym of "Pragmatic":', options: ['Practical', 'Realistic', 'Idealistic', 'Sensible'], answer: 2, explanation: 'Pragmatic = practical; Idealistic = pursuing ideals over practicality.' },
  { id: 92, subject: 'physics', difficulty: 'hard', question: 'Frequency of AC supply in India is:', options: ['50 Hz', '60 Hz', '100 Hz', '220 Hz'], answer: 0, explanation: 'India uses 50 Hz AC supply.' },
  { id: 93, subject: 'chemistry', difficulty: 'hard', question: 'Hardest natural substance is:', options: ['Gold', 'Iron', 'Diamond', 'Platinum'], answer: 2, explanation: 'Diamond is the hardest natural substance (allotrope of carbon).' },
  { id: 94, subject: 'history', difficulty: 'hard', question: 'First war of Indian Independence is also called:', options: ['Green Revolution', 'Sepoy Mutiny', 'Salt March', 'Civil Disobedience'], answer: 1, explanation: '1857 revolt is also called Sepoy Mutiny or First War of Independence.' },
  { id: 95, subject: 'geography', difficulty: 'hard', question: 'India shares longest land border with:', options: ['China', 'Pakistan', 'Bangladesh', 'Nepal'], answer: 2, explanation: 'India shares its longest land border with Bangladesh (~4,096 km).' },
  { id: 96, subject: 'polity', difficulty: 'hard', question: 'Directive Principles are in which part of Constitution?', options: ['Part III', 'Part IV', 'Part V', 'Part II'], answer: 1, explanation: 'Directive Principles of State Policy are in Part IV (Articles 36-51).' },
  { id: 97, subject: 'math', difficulty: 'hard', question: 'If cot θ = 12/5, then sin θ =', options: ['5/13', '12/13', '5/12', '13/5'], answer: 0, explanation: 'cot θ = 12/5, so adjacent=12, opposite=5, hypotenuse=13, sin θ = 5/13.' },
  { id: 98, subject: 'english', difficulty: 'medium', question: 'Meaning of "Break the ice":', options: ['To freeze', 'To start a conversation', 'To end a relationship', 'To cool down'], answer: 1, explanation: 'To break the ice = to initiate social interaction.' },
  { id: 99, subject: 'physics', difficulty: 'medium', question: 'Unit of power is:', options: ['Joule', 'Newton', 'Watt', 'Pascal'], answer: 2, explanation: 'Power is measured in Watts (W).' },
  { id: 100, subject: 'chemistry', difficulty: 'easy', question: 'Gas used by plants for photosynthesis:', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 2, explanation: 'Plants use CO₂ for photosynthesis and release O₂.' }
];

function getQuestionsByFilter(subject, difficulty, count) {
  let filtered = [...QUESTIONS];
  if (subject && subject !== 'all') {
    filtered = filtered.filter(q => q.subject === subject);
  }
  if (difficulty && difficulty !== 'all') {
    filtered = filtered.filter(q => q.difficulty === difficulty);
  }
  filtered = shuffleArray(filtered);
  return filtered.slice(0, Math.min(count, filtered.length));
}

function getMockQuestions(type) {
  const configs = {
    'math': { subjects: ['math'], count: 120 },
    'math-mini': { subjects: ['math'], count: 30 },
    'gat': { subjects: ['english', 'physics', 'chemistry', 'history', 'geography', 'polity'], count: 150 },
    'gat-mini': { subjects: ['english', 'physics', 'chemistry', 'history', 'geography', 'polity'], count: 30 },
    'combined': { subjects: ['math', 'english', 'physics', 'chemistry', 'history', 'geography', 'polity'], count: 30 }
  };
  const config = configs[type];
  if (!config) return [];

  let pool = QUESTIONS.filter(q => config.subjects.includes(q.subject));
  pool = shuffleArray(pool);

  const result = [];
  const perSubject = Math.ceil(config.count / config.subjects.length);

  for (const sub of config.subjects) {
    const subQs = pool.filter(q => q.subject === sub);
    const needed = type === 'combined' ? (sub === 'math' ? 15 : Math.ceil(15 / 6)) : perSubject;
    for (let i = 0; i < needed && result.length < config.count; i++) {
      result.push(subQs[i % subQs.length] || pool[result.length % pool.length]);
    }
  }

  while (result.length < config.count) {
    result.push(pool[result.length % pool.length]);
  }

  return shuffleArray(result.slice(0, config.count));
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getMockDuration(type) {
  const durations = {
    'math': 150 * 60,
    'math-mini': 40 * 60,
    'gat': 150 * 60,
    'gat-mini': 30 * 60,
    'combined': 45 * 60
  };
  return durations[type] || 3600;
}

function getMockMarks(type) {
  const marks = {
    'math': { correct: 2.5, wrong: -0.83 },
    'math-mini': { correct: 2.5, wrong: -0.83 },
    'gat': { correct: 4, wrong: -1.33 },
    'gat-mini': { correct: 4, wrong: -1.33 },
    'combined': { correct: 3, wrong: -1 }
  };
  return marks[type] || { correct: 2, wrong: -0.67 };
}

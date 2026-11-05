/**
 * Curriculum points for tutor resources (docs/tutor-resources-spec.md §2), imported by
 * `npm run curriculum:import`. Each summary is Study Hall's own short paraphrase of what a point
 * covers, not VCAA's wording; the official documents are linked. Nothing here is published until an
 * admin checks it at /admin/curriculum.
 *
 * TO CHECK against the current VCAA documents before publishing: area names, accreditation
 * periods, and that each paraphrase matches the current study design or curriculum. Codes are left
 * empty on purpose rather than guessed; add them from the documents if wanted.
 */

export type PointSeed = {
  framework: "vce" | "vc";
  subject: string;
  unitOrLevel: string;
  area: string;
  summary: string;
  accreditation?: string;
  sourceUrl: string;
};

const VCAA = "https://www.vcaa.vic.edu.au/curriculum/vce/vce-study-designs";
const VC2 = "https://f10.vcaa.vic.edu.au/";

type Block = { subject: string; unit: string; accreditation: string; areas: Record<string, string[]> };

const vce: Block[] = [
  {
    subject: "Mathematical Methods",
    unit: "Units 3 and 4",
    accreditation: "2023–2027",
    areas: {
      "Functions, relations and graphs": [
        "Graphs of polynomial, power, exponential, logarithmic and circular functions, with their key features.",
        "Transformations of graphs: dilations, reflections and translations, and their effect on rules.",
        "Composite and inverse functions, including domain and range conditions.",
      ],
      "Algebra, number and structure": [
        "Solving polynomial, exponential, logarithmic and trigonometric equations, exactly and numerically.",
        "Index and logarithm laws, and solving systems of simultaneous linear equations.",
      ],
      Calculus: [
        "Derivatives of standard functions using the chain, product and quotient rules.",
        "Applications of differentiation: tangents and normals, stationary points, rates of change and optimisation.",
        "Anti-derivatives, definite integrals, and areas under and between curves.",
        "The fundamental theorem of calculus and average value of a function.",
      ],
      "Data analysis, probability and statistics": [
        "Discrete random variables: probability distributions, mean, variance, and the binomial distribution.",
        "Continuous random variables: probability density functions and the normal distribution.",
        "Sample proportions, their distribution, and approximate confidence intervals for a population proportion.",
      ],
    },
  },
  {
    subject: "Specialist Mathematics",
    unit: "Units 3 and 4",
    accreditation: "2023–2027",
    areas: {
      "Discrete mathematics": ["Proof: direct proof, contrapositive, contradiction, counter-examples and mathematical induction."],
      "Functions, relations and graphs": ["Rational functions, reciprocal circular functions and their graphs, and graphs of relations."],
      "Algebra, number and structure": [
        "Complex numbers in Cartesian and polar form, De Moivre's theorem, roots and factorising polynomials over C.",
        "Regions and curves in the complex plane.",
      ],
      Calculus: [
        "Implicit differentiation, related rates and second derivatives.",
        "Integration techniques: substitution, partial fractions, integration by parts and inverse circular functions.",
        "Volumes of solids of revolution, arc length and surface area.",
        "Differential equations: setting up, solving separable equations, slope fields and Euler's method.",
        "Kinematics: motion in a straight line with variable acceleration.",
      ],
      "Space and measurement": [
        "Vectors in two and three dimensions: scalar and vector products, lines and planes.",
        "Vector calculus for motion: position, velocity and acceleration vectors.",
      ],
      "Data analysis, probability and statistics": [
        "Linear combinations of random variables and the distribution of sample means.",
        "Confidence intervals for a mean and hypothesis testing for a population mean.",
      ],
    },
  },
  {
    subject: "General Mathematics",
    unit: "Units 3 and 4",
    accreditation: "2023–2027",
    areas: {
      "Data analysis": [
        "Displaying and describing univariate data, including the normal model and z-scores.",
        "Associations between two variables, least squares regression, residuals and interpretation.",
        "Time series: trends, seasonality, smoothing and seasonal adjustment.",
      ],
      "Recursion and financial modelling": [
        "Recurrence relations for linear and geometric growth and decay.",
        "Loans, annuities, perpetuities and investments, including using a financial solver.",
      ],
      Matrices: ["Matrix arithmetic, inverses, and applications including transition matrices."],
      "Networks and decision mathematics": [
        "Graphs and networks: paths, circuits, minimum spanning trees and shortest paths.",
        "Flow problems, matching and allocation, and critical path analysis.",
      ],
    },
  },
  {
    subject: "Chemistry",
    unit: "Units 3 and 4",
    accreditation: "2024–2028",
    areas: {
      "Unit 3, AoS 1: Energy options": [
        "Fuels: combustion, thermochemical equations, energy calculations and comparing fossil and biofuels.",
        "Galvanic cells and fuel cells: redox, the electrochemical series and cell design.",
      ],
      "Unit 3, AoS 2: Rate and yield": [
        "Reaction rates: collision theory, activation energy and catalysts.",
        "Chemical equilibrium: equilibrium constants, Le Chatelier's principle and optimising yield.",
        "Electrolytic cells: reactions, Faraday's laws and rechargeable cells.",
      ],
      "Unit 4, AoS 1: Organic compounds": [
        "Naming and structures of organic compounds and their functional groups.",
        "Organic reaction pathways, including synthesis steps and yield and atom economy.",
      ],
      "Unit 4, AoS 2: Analysing organic compounds": [
        "Analytical techniques: mass spectrometry, IR, NMR and chromatography, and interpreting their data.",
        "Food chemistry: carbohydrates, proteins, fats, vitamins, enzymes and energy from food.",
      ],
    },
  },
  {
    subject: "Physics",
    unit: "Units 3 and 4",
    accreditation: "2024–2027",
    areas: {
      "Unit 3: Motion": ["Newton's laws in two dimensions, projectile and circular motion, momentum and energy."],
      "Unit 3: Fields": [
        "Gravitational, electric and magnetic fields: field models, forces on objects and charges.",
        "Electromagnetic induction, generators and transformers, and transmitting electricity.",
      ],
      "Unit 4: Light and matter": [
        "Wave models of light: interference, diffraction and the double-slit experiment.",
        "The photoelectric effect, photons and the wave-particle nature of matter.",
      ],
      "Unit 4: Special relativity": ["Einstein's postulates, time dilation, length contraction and mass-energy equivalence."],
      "Scientific inquiry": ["Planning investigations, analysing data with uncertainty, and evaluating experimental methods."],
    },
  },
  {
    subject: "Biology",
    unit: "Units 3 and 4",
    accreditation: "2022–2026",
    areas: {
      "Unit 3, AoS 1: Nucleic acids and proteins": [
        "Nucleic acids, gene expression and protein synthesis, and gene regulation.",
        "DNA manipulation techniques and their applications.",
      ],
      "Unit 3, AoS 2: Biochemical pathways": [
        "Enzymes and factors affecting their activity.",
        "Photosynthesis and cellular respiration: inputs, outputs, locations and factors affecting rate.",
      ],
      "Unit 4, AoS 1: Responding to pathogens": [
        "Barriers and innate immunity, and the adaptive immune response.",
        "Immunisation, disease spread and immunotherapy.",
      ],
      "Unit 4, AoS 2: Species over time": [
        "Changes in allele frequencies, natural selection and speciation.",
        "Evidence for evolution, and human change over time.",
      ],
    },
  },
  {
    subject: "English",
    unit: "Units 3 and 4",
    accreditation: "2024–2027",
    areas: {
      "Reading and responding to texts": [
        "Writing an analytical response to a set text: interpreting ideas, values and the author's choices, supported by evidence.",
      ],
      "Creating texts": ["Writing original texts for a chosen audience and purpose, with a written explanation of the writer's decisions."],
      "Analysing argument": ["Analysing how arguments and language are used to persuade an audience, and presenting a point of view."],
    },
  },
];

const years = ["Year 7", "Year 8", "Year 9", "Year 10"];

const vc: Record<string, Record<string, (year: string) => string>> = {
  Mathematics: {
    Number: (y) => `${y} number: integers, fractions, decimals, percentages, ratios and rates, and working with indices and roots.`,
    Algebra: (y) => `${y} algebra: expressions, linear and non-linear relationships, solving equations and graphing.`,
    Measurement: (y) => `${y} measurement: length, area, volume, time, and using formulas in practical problems.`,
    Space: (y) => `${y} space: angles, shapes, congruence and similarity, Pythagoras and trigonometry where the year covers them.`,
    Statistics: (y) => `${y} statistics: collecting, displaying and comparing data, and interpreting summary statistics.`,
    Probability: (y) => `${y} probability: outcomes, experiments, two-way tables and calculating probabilities.`,
  },
  Science: {
    "Biological sciences": (y) => `${y} biological sciences: cells, body systems, classification, ecosystems, genetics or evolution as the year covers them.`,
    "Chemical sciences": (y) => `${y} chemical sciences: particles, mixtures, elements and compounds, chemical reactions and the periodic table.`,
    "Earth and space sciences": (y) => `${y} earth and space sciences: Earth, the solar system, rocks and resources, and global systems.`,
    "Physical sciences": (y) => `${y} physical sciences: forces, energy transfer, electricity, waves and motion.`,
    "Science inquiry": (y) => `${y} science inquiry: questioning, planning fair tests, recording and analysing data, and evaluating conclusions.`,
  },
  English: {
    Language: (y) => `${y} language: grammar, sentence structure, punctuation, vocabulary and how language choices shape meaning.`,
    Literature: (y) => `${y} literature: responding to and analysing stories, poems and plays, and how authors create effects.`,
    Literacy: (y) => `${y} literacy: reading comprehension, persuasive and informative writing, and editing for clarity.`,
  },
};

export const CURRICULUM_POINTS: PointSeed[] = [
  ...vce.flatMap((b) =>
    Object.entries(b.areas).flatMap(([area, summaries]) =>
      summaries.map((summary) => ({
        framework: "vce" as const,
        subject: b.subject,
        unitOrLevel: b.unit,
        area,
        summary,
        accreditation: b.accreditation,
        sourceUrl: VCAA,
      })),
    ),
  ),
  ...Object.entries(vc).flatMap(([subject, strands]) =>
    years.flatMap((year) =>
      Object.entries(strands).map(([area, summary]) => ({
        framework: "vc" as const,
        subject,
        unitOrLevel: year,
        area,
        summary: summary(year),
        accreditation: "Version 2.0",
        sourceUrl: VC2,
      })),
    ),
  ),
];

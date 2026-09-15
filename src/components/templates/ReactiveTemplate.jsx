import ResumeTemplateLayout from './ResumeTemplateLayout.jsx'

// Adapted from the MIT-licensed Reactive Resume template family.
// The source checkout used for the visual reference is kept outside the app;
// this small adapter lets Resumetrics keep its existing resume data/editing
// pipeline while exposing the same fifteen template identities.
export const createReactiveTemplate = variant => function ReactiveResumeTemplate(props) {
  return <ResumeTemplateLayout {...props} variant={variant} />
}

export const GengarTemplate = createReactiveTemplate('gengar')
export const GlalieTemplate = createReactiveTemplate('glalie')
export const DitgarTemplate = createReactiveTemplate('ditgar')
export const KakunaTemplate = createReactiveTemplate('kakuna')
export const LaprasTemplate = createReactiveTemplate('lapras')
export const LeafishTemplate = createReactiveTemplate('leafish')
export const MeowthTemplate = createReactiveTemplate('meowth')
export const OnyxTemplate = createReactiveTemplate('onyx')
export const PikachuTemplate = createReactiveTemplate('pikachu')
export const RhyhornTemplate = createReactiveTemplate('rhyhorn')
export const ScizorTemplate = createReactiveTemplate('scizor')

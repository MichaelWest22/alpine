import { directive, prefix } from '../directives'
import { initInterceptors } from '../interceptor'
import { injectDataProviders } from '../datas'
import { addRootSelector } from '../lifecycle'
import { interceptClone, isCloning, isCloningLegacy } from '../clone'
import { addScopeToNode } from '../scope'
import { injectMagics, magic } from '../magics'
import { reactive } from '../reactivity'
import { evaluate } from '../evaluator'
import { onAttributeChanged, mutateDom } from '../mutation'
import { cleanupElement, cleanupAttributes } from '../mutation'
import { initTree } from '../lifecycle'

addRootSelector(() => `[${prefix('data')}]`)

directive('data', ((el, { expression }, { cleanup }) => {
    if (shouldSkipRegisteringDataDuringClone(el)) return

    expression = expression === '' ? '{}' : expression

    let magicContext = {}
    injectMagics(magicContext, el)

    let dataProviderContext = {}
    injectDataProviders(dataProviderContext, magicContext)

    let data = evaluate(el, expression, { scope: dataProviderContext })

    if (data === undefined || data === true) data = {}

    injectMagics(data, el)

    let reactiveData = reactive(data)

    initInterceptors(reactiveData)

    let undo = addScopeToNode(el, reactiveData)

    reactiveData['init'] && evaluate(el, reactiveData['init'])

    cleanup(() => {
        reactiveData['destroy'] && evaluate(el, reactiveData['destroy'])

        undo()
    })
}))

// Handle x-data attribute value changes (e.g., during morphing)
onAttributeChanged((el, attrs) => {
    attrs.forEach(({ name, oldValue, value }) => {
        if (name !== `${prefix('data')}`) return
        // Check if this is a value change (not just add/remove)
        if (!oldValue || oldValue === value) return

        // Destroy the entire subtree (cleans up all directives and effects)
        el.querySelectorAll('*').forEach(child => {
            cleanupElement(child)
            cleanupAttributes(child)
            delete child._x_marker
        })
        
        // Clean up the element itself
        cleanupElement(el)
        cleanupAttributes(el)
        delete el._x_marker
        delete el._x_dataStack

        // Re-initialize the entire tree (will re-run all directives including x-for)
        // Wrap in mutateDom to prevent re-entrant mutation observer calls
        mutateDom(() => {
            initTree(el)
        })
    })
})

interceptClone((from, to) => {
    // Transfer over existing runtime Alpine state from
    // the existing dom tree over to the new one...
    if (from._x_dataStack) {
        to._x_dataStack = from._x_dataStack

        // Set a flag to signify the new tree is using
        // pre-seeded state (used so x-data knows when
        // and when not to initialize state)...
        to.setAttribute('data-has-alpine-state', true)
    }
})

// If we are cloning a tree, we only want to evaluate x-data if another
// x-data context DOESN'T exist on the component.
// The reason a data context WOULD exist is that we graft root x-data state over
// from the live tree before hydrating the clone tree.
function shouldSkipRegisteringDataDuringClone(el) {
    if (! isCloning) return false
    if (isCloningLegacy) return true

    return el.hasAttribute('data-has-alpine-state')
}

import { directive, prefix } from '../directives'
import { initInterceptors } from '../interceptor'
import { injectDataProviders } from '../datas'
import { addRootSelector, destroyTree, initTree } from '../lifecycle'
import { interceptClone, isCloning, isCloningLegacy } from '../clone'
import { addScopeToNode, closestDataStack } from '../scope'
import { injectMagics, magic } from '../magics'
import { reactive } from '../reactivity'
import { evaluate } from '../evaluator'

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

    // If scope already exists, this is a re-run due to attribute change.
    // Merge only keys the server changed; preserve client-mutated values.
    if (el._x_originalData) {
        Object.keys(data).forEach(key => {
            if (data[key] !== el._x_originalData[key]) el._x_dataStack[0][key] = data[key]
        })
        el._x_originalData = {...data}
        return
    }

    el._x_originalData = {...data}

    injectMagics(data, el)

    let reactiveData = reactive(data)

    initInterceptors(reactiveData)

    let undo = addScopeToNode(el, reactiveData)

    if (el._x_childrenNeedInit) {
        delete el._x_childrenNeedInit
        Array.from(el.children).forEach(child => initTree(child))
    }

    reactiveData['init'] && evaluate(el, reactiveData['init'])

    cleanup(() => {
        reactiveData['destroy'] && evaluate(el, reactiveData['destroy'])
        // x-data attribute still present means it changed, not removed — skip teardown.
        if (el.isConnected && el.hasAttribute(prefix('data'))) return
        undo()
        delete el._x_dataStack
        delete el._x_originalData
        Array.from(el.children).forEach(child => destroyTree(child))
        // If an ancestor scope exists, re-init children against it now.
        // Otherwise flag them for re-init when x-data is re-added.
        if (el.parentElement && closestDataStack(el.parentElement).length) {
            Array.from(el.children).forEach(child => initTree(child))
        } else {
            el._x_childrenNeedInit = true
        }
    })

}))

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
